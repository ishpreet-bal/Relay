import { startOfDay } from 'date-fns';
import { Prisma, type PipelineStage } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { assertClientAccess, type AccessContext } from '@/server/access/scope';
import { DomainError, NotFoundError } from '@/server/errors';
import { isCapabilityAvailable } from '@/server/connectors/registry';
import { enqueueJob, enqueueJobs } from '@/server/services/jobs';
import { logActivity } from '@/server/services/activity';
import { rescoreAccount } from '@/server/services/scoring';
import type { AccountScore } from '@/server/services/scoring/types';
import { getPipelineSettings } from './settings';
import { budgetStatus, type BudgetCategory } from './budgets';
import { reasonsJson, refreshDue, screenAccount, stageAfterScreening } from './screening';
import { snapshotAnalysis } from './versions';

/**
 * The stage gates of the research funnel:
 *   1 discovered → 2 screened (deterministic, every account)
 *   → 3 analysed (focused website research, promising accounts)
 *   → 4 deep research (high-priority prospects only).
 * Advancing costs more at each gate, so each is guarded by a threshold, a
 * daily cap, and its budget category; a person can promote any account
 * past a gate, and that choice sticks.
 */

export type Trigger = 'AUTO' | 'MANUAL' | 'SIGNAL' | 'REFRESH' | 'PROMOTION';

const SCREEN_BATCH = 200;

async function budgetOpen(organizationId: string, category: BudgetCategory) {
  const lines = await budgetStatus(organizationId);
  return lines.filter((l) => l.category === category || l.category === 'global').every((l) => l.level !== 'reached');
}

/** Jobs a gate has started automatically today, for the daily caps. */
async function automaticToday(organizationId: string, type: 'RESEARCH' | 'DEEP_RESEARCH') {
  return db.job.count({
    where: { organizationId, type, createdAt: { gte: startOfDay(new Date()) }, NOT: { payload: { path: ['trigger'], equals: 'MANUAL' } } },
  });
}

// ---------------------------------------------------------------------------
// Stage 2
// ---------------------------------------------------------------------------

const SCREENING_SELECT = {
  id: true, clientId: true, scoredAt: true, scoreBreakdown: true, websiteUrl: true, domain: true, contentFingerprint: true,
  employeeCount: true, phone: true, doNotContact: true, pipelineStage: true, stagePinned: true, opportunityTier: true,
  _count: { select: { contacts: { where: { deletedAt: null } }, branches: { where: { deletedAt: null } } } },
  signals: { where: { dismissedAt: null }, select: { type: true, eventDate: true, detectedAt: true }, take: 50 },
} satisfies Prisma.AccountSelect;

export async function screenAccounts(organizationId: string, accountIds: string[]) {
  const settings = await getPipelineSettings(organizationId);
  const summary = { screened: 0, qualified: 0, screenedOut: 0, analysesQueued: 0 };
  const toAnalyze: Array<{ id: string; score: number }> = [];

  // Accounts are normally scored when created; score any that weren't first.
  const unscored = await db.account.findMany({
    where: { id: { in: accountIds }, organizationId, deletedAt: null, OR: [{ scoredAt: null }, { scoreBreakdown: { equals: Prisma.DbNull } }] },
    select: { id: true },
  });
  for (const a of unscored) await rescoreAccount(a.id);

  // One read and one write for the whole batch.
  const accounts = await db.account.findMany({ where: { id: { in: accountIds }, organizationId, deletedAt: null }, select: SCREENING_SELECT });
  const now = new Date();
  const rows: Prisma.Sql[] = [];
  for (const account of accounts) {
    const result = screenAccount({
      score: account.scoreBreakdown as unknown as AccountScore | null,
      hasWebsite: !!account.websiteUrl,
      websiteConfirmed: !!account.contentFingerprint,
      employeeCount: account.employeeCount,
      locations: 1 + account._count.branches,
      hasPhone: !!account.phone,
      contacts: account._count.contacts,
      signals: account.signals,
      doNotContact: account.doNotContact,
    }, settings);
    const stage = stageAfterScreening(account.pipelineStage, account.stagePinned, result.advance);
    const refresh = refreshDue(result.tier, stage, settings);
    rows.push(Prisma.sql`(${account.id}::uuid, ${result.score}::int, ${JSON.stringify(reasonsJson(result))}::jsonb, ${result.tier}::"OpportunityTier", ${stage}::"PipelineStage", ${refresh}::timestamp(3))`);
    summary.screened++;
    if (stage === 'QUALIFIED') summary.qualified++;
    if (stage === 'SCREENED_OUT') summary.screenedOut++;
    if (stage === 'QUALIFIED' && account.websiteUrl) toAnalyze.push({ id: account.id, score: result.score });
  }
  if (rows.length) {
    await db.$executeRaw`
      UPDATE "Account" AS a
      SET "screeningScore" = v.score, "screeningReasons" = v.reasons, "screenedAt" = ${now}::timestamp(3),
          "opportunityTier" = v.tier, "pipelineStage" = v.stage, "nextRefreshAt" = v.refresh, "updatedAt" = ${now}::timestamp(3)
      FROM (VALUES ${Prisma.join(rows)}) AS v(id, score, reasons, tier, stage, refresh)
      WHERE a.id = v.id`;
  }

  if (settings.autoAnalyze && toAnalyze.length) {
    const room = Math.max(0, settings.maxAnalysesPerDay - await automaticToday(organizationId, 'RESEARCH'));
    // Best first: when the daily allowance runs out, the strongest accounts got it.
    toAnalyze.sort((x, y) => y.score - x.score);
    for (const { id } of toAnalyze.slice(0, room)) {
      const job = await queueAnalysis(organizationId, id, 'AUTO').catch((err) => { logger.info('pipeline.analysis_skipped', { accountId: id, reason: String(err) }); return null; });
      if (job) summary.analysesQueued++;
    }
  }
  return summary;
}

/** Queues screening for every account that needs it (new, or a signal arrived). */
export async function enqueuePendingScreening(organizationId: string, limit = 5_000) {
  const settings = await getPipelineSettings(organizationId);
  if (!settings.autoScreen) return 0;
  const pending = await db.account.findMany({
    where: { organizationId, deletedAt: null, screenedAt: null },
    select: { id: true, updatedAt: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  const batches: Array<{ ids: string[] }> = [];
  for (let i = 0; i < pending.length; i += SCREEN_BATCH) batches.push({ ids: pending.slice(i, i + SCREEN_BATCH).map((p) => p.id) });
  return enqueueJobs('SCREENING', batches.map((b) => ({
    organizationId,
    payload: { accountIds: b.ids },
    // The same set of accounts in the same state is screened once.
    idempotencyKey: `screen:${b.ids[0]}:${b.ids.length}:${pending.find((p) => p.id === b.ids[0])!.updatedAt.getTime()}`,
  })));
}

/**
 * Qualified accounts that missed a day's analysis allowance wait here. Each
 * maintenance pass spends what is left of today's allowance on them, best
 * first, so the daily cap is used every day and the month's budget is spread
 * across the month instead of going to whichever day discovered the most.
 * Accounts already tried once (any analysis job, even a failed or cancelled
 * one) are left for a person or the refresh schedule.
 */
export async function queueQualifiedBacklog(organizationId: string) {
  const settings = await getPipelineSettings(organizationId);
  if (!settings.autoAnalyze) return 0;
  let room = settings.maxAnalysesPerDay - await automaticToday(organizationId, 'RESEARCH');
  if (room <= 0) return 0;
  if (!(await isCapabilityAvailable(organizationId, 'AI')) || !(await budgetOpen(organizationId, 'analysis'))) return 0;
  const candidates = await db.account.findMany({
    where: { organizationId, deletedAt: null, doNotContact: false, pipelineStage: 'QUALIFIED', researchVersion: 0, websiteUrl: { not: null }, research: { is: null } },
    orderBy: [{ screeningScore: 'desc' }, { createdAt: 'asc' }],
    select: { id: true },
    take: room * 4,
  });
  if (!candidates.length) return 0;
  const tried = new Set((await db.job.findMany({
    where: { organizationId, type: 'RESEARCH', entityId: { in: candidates.map((c) => c.id) } },
    select: { entityId: true },
  })).map((j) => j.entityId));
  let queued = 0;
  for (const c of candidates) {
    if (room <= 0) break;
    if (tried.has(c.id)) continue;
    const job = await queueAnalysis(organizationId, c.id, 'AUTO').catch((err) => { logger.info('pipeline.backlog_skipped', { accountId: c.id, reason: String(err) }); return null; });
    if (job) { queued++; room--; }
  }
  return queued;
}

/** Marks an account for screening again (a new signal, a material change). */
export function markForScreening(accountId: string) {
  return db.account.update({ where: { id: accountId }, data: { screenedAt: null } });
}

// ---------------------------------------------------------------------------
// Stages 3 and 4
// ---------------------------------------------------------------------------

export async function queueAnalysis(organizationId: string, accountId: string, trigger: Trigger, userId: string | null = null) {
  const account = await db.account.findFirst({ where: { id: accountId, organizationId, deletedAt: null }, select: { id: true, clientId: true, websiteUrl: true, researchVersion: true } });
  if (!account) throw new NotFoundError('Account');
  if (!account.websiteUrl) throw new DomainError('This account has no website to analyse.');
  if (!(await isCapabilityAvailable(organizationId, 'AI'))) throw new DomainError('No AI provider is connected. Set ANTHROPIC_API_KEY, then check it under Connectors.');
  if (!(await budgetOpen(organizationId, 'analysis'))) throw new DomainError("This month's AI analysis budget is used up.");
  return enqueueJob({
    type: 'RESEARCH', organizationId, clientId: account.clientId, entityType: 'Account', entityId: accountId,
    payload: { trigger }, provider: 'anthropic', createdById: userId, priority: trigger === 'MANUAL' ? 10 : 0,
    idempotencyKey: `analysis:${accountId}:v${account.researchVersion + 1}`,
  });
}

export async function queueDeepResearch(organizationId: string, accountId: string, trigger: Trigger, userId: string | null = null) {
  const account = await db.account.findFirst({ where: { id: accountId, organizationId, deletedAt: null }, select: { id: true, clientId: true, researchVersion: true, pipelineStage: true } });
  if (!account) throw new NotFoundError('Account');
  if (account.researchVersion < 1) throw new DomainError('Deep research builds on a completed analysis. Analyse the account first.');
  if (!(await isCapabilityAvailable(organizationId, 'AI'))) throw new DomainError('No AI provider is connected. Set ANTHROPIC_API_KEY, then check it under Connectors.');
  if (!(await budgetOpen(organizationId, 'deep'))) throw new DomainError("This month's deep research budget is used up.");
  return enqueueJob({
    type: 'DEEP_RESEARCH', organizationId, clientId: account.clientId, entityType: 'Account', entityId: accountId,
    payload: { trigger }, provider: 'anthropic', createdById: userId, priority: trigger === 'MANUAL' ? 10 : 0,
    idempotencyKey: `deep:${accountId}:v${account.researchVersion}`,
  });
}

/**
 * After an analysis completes: keep it as a version, move the account to
 * ANALYZED, screen again (research adds signals), and queue deep research
 * if it now clears the deep threshold and automatic deep research is on.
 */
export async function afterAnalysis(organizationId: string, accountId: string, trigger: Trigger) {
  const version = await snapshotAnalysis(accountId, trigger);
  const account = await db.account.findUniqueOrThrow({ where: { id: accountId }, select: { pipelineStage: true, stagePinned: true } });
  await db.account.update({
    where: { id: accountId },
    data: {
      researchVersion: { increment: version ? 1 : 0 },
      lastResearchedAt: new Date(),
      researchCostMillicents: { increment: version?.costMillicents ?? 0 },
      ...(account.pipelineStage === 'DEEP_RESEARCHED' || account.stagePinned ? {} : { pipelineStage: 'ANALYZED' as const }),
    },
  });
  await screenAccounts(organizationId, [accountId]);
  const settings = await getPipelineSettings(organizationId);
  const after = await db.account.findUniqueOrThrow({ where: { id: accountId }, select: { screeningScore: true, opportunityTier: true } });
  if (settings.autoDeep && (after.screeningScore ?? 0) >= settings.deepThreshold && after.opportunityTier !== 'SUPPRESSED') {
    const room = settings.maxDeepPerDay - await automaticToday(organizationId, 'DEEP_RESEARCH');
    if (room > 0) await queueDeepResearch(organizationId, accountId, 'AUTO').catch((err) => logger.info('pipeline.deep_skipped', { accountId, reason: String(err) }));
  }
  return version;
}

// ---------------------------------------------------------------------------
// Manual control
// ---------------------------------------------------------------------------

export async function setStage(access: AccessContext, userId: string, accountId: string, stage: PipelineStage, note: string | null) {
  const account = await db.account.findFirst({ where: { id: accountId, organizationId: access.organizationId, deletedAt: null }, select: { id: true, clientId: true, pipelineStage: true } });
  if (!account) throw new NotFoundError('Account');
  assertClientAccess(access, account.clientId);
  await db.account.update({
    where: { id: accountId },
    data: { pipelineStage: stage, stagePinned: true, promotedById: userId, promotedAt: new Date(), promotionNote: note },
  });
  await logActivity({
    organizationId: access.organizationId, clientId: account.clientId, accountId, userId, type: 'SYSTEM',
    title: `Research stage set to ${stage.toLowerCase().replace('_', ' ')} by hand`,
    body: note, metadata: { from: account.pipelineStage, to: stage },
  });
}

/** Hands the stage back to automatic screening. */
export async function releaseStage(access: AccessContext, accountId: string) {
  const account = await db.account.findFirst({ where: { id: accountId, organizationId: access.organizationId }, select: { id: true, clientId: true } });
  if (!account) throw new NotFoundError('Account');
  assertClientAccess(access, account.clientId);
  await db.account.update({ where: { id: accountId }, data: { stagePinned: false, screenedAt: null } });
  return screenAccounts(access.organizationId, [accountId]);
}
