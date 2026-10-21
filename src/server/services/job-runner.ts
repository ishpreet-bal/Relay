import type { Job, JobType } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { runResearch } from '@/server/ai/research';
import { BudgetExceededError } from '@/server/ai/budget';
import { systemAccess } from '@/server/access/scope';
import { NotConfiguredError } from '@/server/errors';
import { rescoreAccount } from './scoring';
import { refreshQueue } from './call-queue';
import { claimJob, claimJobs, completeJob, failJob, requeueJob } from './jobs';
import { discoverContacts, enrichAccount } from './enrichment';
import { executeDiscoveryStep } from './discovery/run';
import { sweepRetention } from './discovery/retention';
import { backfillCompanyKeys } from './companies/backfill';

/**
 * Executing queued work, shared by everything that can drive it: the
 * long-running worker (npm run worker), the scheduled cron tick, and pages
 * that move a run forward while someone watches it. Each caller passes a
 * deadline; handlers that can pause (discovery runs) stop before it and are
 * re-queued without using up an attempt.
 */

export interface RunContext {
  /** Epoch ms by which the handler should have returned. */
  deadline: number;
}

/** Returned by a handler that made progress and wants to continue later. */
export const CONTINUE = Symbol('continue');

type Handler = (job: Job, ctx: RunContext) => Promise<unknown>;

function requireOrg(job: Job) {
  if (!job.organizationId) throw new Error('Job has no organization');
  return systemAccess(job.organizationId);
}

const HANDLERS: Partial<Record<JobType, Handler>> = {
  RESCORE: async (job) => {
    if (job.entityId) return rescoreAccount(job.entityId).then(() => ({ rescored: 1 }));
    const accounts = await db.account.findMany({
      where: { organizationId: job.organizationId ?? undefined, ...(job.clientId ? { clientId: job.clientId } : {}), deletedAt: null },
      select: { id: true },
    });
    for (const a of accounts) await rescoreAccount(a.id);
    return { rescored: accounts.length };
  },
  CALL_QUEUE_REFRESH: (job) => refreshQueue(requireOrg(job).organizationId, job.clientId),
  ACCOUNT_ENRICHMENT: (job) => enrichAccount(requireOrg(job), job.entityId!),
  CONTACT_ENRICHMENT: (job) => discoverContacts(requireOrg(job), job.entityId!, Number((job.payload as { limit?: number } | null)?.limit ?? 5)),
  RESEARCH: (job) => runResearch(requireOrg(job).organizationId, job.entityId!).then((r) => ({ signals: r.signalsCreated, groundingRate: r.report.groundingRate })),
  DISCOVERY_RUN: async (job, ctx) => {
    const { done } = await executeDiscoveryStep(job.entityId!, { deadline: ctx.deadline });
    return done ? { runId: job.entityId } : CONTINUE;
  },
  RETENTION_SWEEP: () => sweepRetention(),
  MAINTENANCE: () => backfillCompanyKeys(),
};

/** Job types quick enough (or pausable) to run inside a serverless function. */
export const SERVERLESS_JOB_TYPES: JobType[] = [
  'DISCOVERY_RUN', 'RETENTION_SWEEP', 'MAINTENANCE', 'CALL_QUEUE_REFRESH', 'ACCOUNT_ENRICHMENT', 'CONTACT_ENRICHMENT',
];

async function execute(job: Job, ctx: RunContext) {
  const handler = HANDLERS[job.type];
  if (!handler) {
    await failJob(job, new Error(`No handler for ${job.type}`), { retryable: false });
    return;
  }
  try {
    const result = await handler(job, ctx);
    if (result === CONTINUE) await requeueJob(job.id);
    else await completeJob(job.id, (result ?? null) as never);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      await db.job.update({ where: { id: job.id }, data: { status: 'RETRYING', runAt: new Date(Date.now() + 3600_000), error: err.message, lockedAt: null, lockedBy: null } });
      return;
    }
    // Missing configuration will not fix itself by retrying.
    await failJob(job, err, { retryable: !(err instanceof NotConfiguredError) });
    logger.error('job.failed', { jobId: job.id, type: job.type, error: err });
  }
}

export async function processJobs(workerId: string, concurrency: number, ctx: RunContext, types?: JobType[]) {
  const jobs = await claimJobs(workerId, concurrency, types);
  await Promise.all(jobs.map((job) => execute(job, ctx)));
  return jobs.length;
}

/** Runs one specific job now, if nobody else holds it. */
export async function runJobNow(jobId: string, workerId: string, ctx: RunContext) {
  // A step holds its job for under a minute; one silent for three has died.
  const job = await claimJob(jobId, workerId, 3 * 60_000);
  if (!job) return false;
  await execute(job, ctx);
  return true;
}

// ---------------------------------------------------------------------------
// Research (its own queue: Research rows with status QUEUED)
// ---------------------------------------------------------------------------

interface ClaimedResearch { id: string; accountId: string; organizationId: string }

async function claimResearchJobs(limit: number): Promise<ClaimedResearch[]> {
  return db.$queryRaw<ClaimedResearch[]>`
    UPDATE "Research"
    SET status = 'RUNNING', "updatedAt" = NOW()
    WHERE id IN (
      SELECT id FROM "Research"
      WHERE status = 'QUEUED'
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "accountId", "organizationId";
  `;
}

export async function processResearch(concurrency: number) {
  const jobs = await claimResearchJobs(concurrency);
  await Promise.all(jobs.map(async (job) => {
    try {
      await runResearch(job.organizationId, job.accountId);
      logger.info('research.completed', { accountId: job.accountId });
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        // Not the account's fault. Requeue so it resumes when budget allows.
        await db.research.update({ where: { id: job.id }, data: { status: 'QUEUED', error: err.message } });
        logger.warn('research.budget_exhausted', { accountId: job.accountId });
        return;
      }
      logger.error('research.failed', { accountId: job.accountId, error: err });
    }
  }));
  return jobs.length;
}

// ---------------------------------------------------------------------------
// Stale scores (ICP changes, imports and discovery mark scores stale with scoredAt = null)
// ---------------------------------------------------------------------------

export async function processStaleScores(batch: number) {
  const stale = await db.account.findMany({ where: { scoredAt: null, deletedAt: null }, select: { id: true }, take: batch });
  for (const a of stale) {
    try { await rescoreAccount(a.id); } catch (err) { logger.error('rescore.failed', { accountId: a.id, error: err }); }
  }
  return stale.length;
}
