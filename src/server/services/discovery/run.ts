import { format } from 'date-fns';
import type { DiscoveryOutcome, DiscoveryProfile, DiscoveryRun, DiscoveryTrigger, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { assertClientAccess, systemAccess, type AccessContext } from '@/server/access/scope';
import { NotFoundError } from '@/server/errors';
import { connectorById, connectorStates } from '@/server/connectors/registry';
import type { ConnectorDefinition, DiscoveredCompany, DiscoveryQuery } from '@/server/connectors/types';
import { createAccount, type AccountInput, type AccountSourceInfo } from '@/server/services/accounts';
import { canonicalDomain, normalizeCompanyName } from '@/server/services/companies/normalize';
import { recordProvenance } from '@/server/services/provenance';
import { findSuppression } from '@/server/services/suppression';
import { recordUsage } from '@/server/services/usage';
import { enqueueJob } from '@/server/services/jobs';
import { ProviderUnavailableError, throttled } from '@/server/queues/throttle';
import { assertCategoryBudget, CategoryBudgetError } from '@/server/services/pipeline/budgets';
import { exclusionReason, nextRunAfter, planQueries, type PlanningProfile } from './plan';
import { budgetLevel, monthSpendMillicents } from './profiles';
import { confirmName, readSiteIdentity, type SiteIdentity } from './site-identity';

/**
 * A discovery run: every search a profile plans, against each connected
 * source, until the result limit, the monthly budget or the source runs out.
 *
 * Runs advance in steps that each fit inside a deadline (a serverless
 * function's time limit, or a worker's time slice) and save a cursor, so the
 * same run can be moved forward by the worker, the cron tick, or the
 * Discovery page while it is open, without repeating work or double-paying
 * for a search. Each result goes through the same matching as manual entry
 * and import, so a business already on file is enriched, never duplicated.
 */

type SourceStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'NOT_CONFIGURED' | 'FAILED' | 'STOPPED';

interface SourceStats {
  status: SourceStatus;
  requests: number;
  results: number;
  errors: number;
  costMillicents: number;
  detail?: string | null;
}

export interface RunDetails {
  cursor: { source: number; query: number; page: number; pageToken: string | null } | null;
  sources: Record<string, SourceStats>;
  stopReason: string | null;
  warnings: string[];
  costIsEstimate: boolean;
}

/** Leave this much of a step's time for one page of results (search, site reads, matching). */
const PAGE_TIME_MS = 40_000;
const SITE_CONCURRENCY = 8;
const SITE_TIMEOUT_MS = 10_000;

const emptyStats = (): SourceStats => ({ status: 'PENDING', requests: 0, results: 0, errors: 0, costMillicents: 0 });

export function readDetails(value: Prisma.JsonValue | null, sources: string[]): RunDetails {
  const v = (value ?? {}) as Partial<RunDetails>;
  const stats: Record<string, SourceStats> = {};
  for (const s of sources) stats[s] = { ...emptyStats(), ...(v.sources?.[s] ?? {}) };
  return {
    cursor: v.cursor ?? null,
    sources: stats,
    stopReason: v.stopReason ?? null,
    warnings: v.warnings ?? [],
    costIsEstimate: v.costIsEstimate ?? false,
  };
}

/** The profile's search settings, frozen when the run starts. */
function planningOf(p: DiscoveryProfile): PlanningProfile {
  return {
    country: p.country, regions: p.regions, cities: p.cities, latitude: p.latitude, longitude: p.longitude, radiusKm: p.radiusKm,
    industries: p.industries, keywords: p.keywords, excludeKeywords: p.excludeKeywords,
    employeeMin: p.employeeMin, employeeMax: p.employeeMax, maxResultsPerRun: p.maxResultsPerRun,
  };
}

// ---------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------

export async function startDiscoveryRun(access: AccessContext, userId: string | null, profileId: string, trigger: DiscoveryTrigger) {
  const profile = await db.discoveryProfile.findFirst({ where: { id: profileId, organizationId: access.organizationId, archivedAt: null } });
  if (!profile) throw new NotFoundError('Discovery profile');
  assertClientAccess(access, profile.clientId);

  const active = await db.discoveryRun.findFirst({ where: { profileId, status: { in: ['QUEUED', 'RUNNING', 'RETRYING'] } } });
  if (active) return { run: active, started: false };

  const spent = await monthSpendMillicents(profileId);
  const overBudget = budgetLevel(spent, profile.monthlyBudgetCents) === 'reached';
  const now = new Date();
  const run = await db.discoveryRun.create({
    data: {
      organizationId: access.organizationId,
      clientId: profile.clientId,
      icpId: profile.icpId,
      profileId,
      name: `${profile.name} · ${format(now, 'MMM d, HH:mm')}`,
      sources: profile.sources,
      trigger,
      filters: planningOf(profile) as unknown as Prisma.InputJsonValue,
      status: overBudget ? 'CANCELLED' : 'QUEUED',
      error: overBudget ? "This month's budget for the profile is used up. Raise it or wait for next month." : null,
      finishedAt: overBudget ? now : null,
      createdById: userId,
      details: readDetails(null, profile.sources) as unknown as Prisma.InputJsonValue,
    },
  });
  if (overBudget) {
    await db.discoveryProfile.update({ where: { id: profileId }, data: { lastRunAt: now, lastRunStatus: 'CANCELLED' } });
    return { run, started: false };
  }
  await enqueueJob({
    type: 'DISCOVERY_RUN', organizationId: access.organizationId, clientId: profile.clientId,
    entityType: 'DiscoveryRun', entityId: run.id, createdById: userId, maxAttempts: 3,
  });
  return { run, started: true };
}

export async function cancelDiscoveryRun(access: AccessContext, runId: string) {
  const run = await db.discoveryRun.findFirst({ where: { id: runId, organizationId: access.organizationId } });
  if (!run) throw new NotFoundError('Discovery run');
  if (run.clientId) assertClientAccess(access, run.clientId);
  if (!['QUEUED', 'RUNNING', 'RETRYING'].includes(run.status)) return run;
  await db.job.updateMany({ where: { entityId: runId, type: 'DISCOVERY_RUN', status: { in: ['QUEUED', 'RETRYING'] } }, data: { status: 'CANCELLED' } });
  return finishRun(run, 'CANCELLED', 'Cancelled by a person');
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

interface Counters {
  found: number; imported: number; updated: number; duplicates: number; excluded: number; needsReview: number;
  failedCount: number; queriesRun: number; costMillicents: number;
}

/**
 * Moves a run forward until it finishes or `deadline` (epoch ms) is near.
 * Returns done: false when there is more to do; the caller re-queues it.
 */
export interface StepResult {
  done: boolean;
  /** When the run should continue, if not now (a provider is paused). */
  retryAt?: Date;
  reason?: string;
}

export async function executeDiscoveryStep(runId: string, opts: { deadline: number }): Promise<StepResult> {
  const run = await db.discoveryRun.findUnique({ where: { id: runId }, include: { profile: true } });
  if (!run || !['QUEUED', 'RUNNING', 'RETRYING'].includes(run.status)) return { done: true };
  const profile = run.profile;
  if (!profile || profile.archivedAt || !run.clientId) {
    await finishRun(run, 'CANCELLED', 'The profile was archived');
    return { done: true };
  }
  if (run.status !== 'RUNNING') {
    await db.discoveryRun.update({ where: { id: run.id }, data: { status: 'RUNNING', startedAt: run.startedAt ?? new Date() } });
  }

  const plan = { ...planningOf(profile), ...((run.filters ?? {}) as Partial<PlanningProfile>) };
  const details = readDetails(run.details, run.sources);
  const counters: Counters = {
    found: run.found, imported: run.imported, updated: run.updated, duplicates: run.duplicates, excluded: run.excluded,
    needsReview: run.needsReview, failedCount: run.failedCount, queriesRun: run.queriesRun, costMillicents: run.costMillicents,
  };
  const save = () => db.discoveryRun.update({
    where: { id: run.id },
    data: { ...counters, costCents: Math.round(counters.costMillicents / 1000), details: details as unknown as Prisma.InputJsonValue },
  });

  const states = new Map((await connectorStates(run.organizationId)).map((s) => [s.id, s]));
  const budget = profile.monthlyBudgetCents * 1000;
  let spent = await monthSpendMillicents(profile.id);
  const seen = new Set((await db.discoveryResult.findMany({ where: { runId: run.id }, select: { provider: true, externalId: true } }))
    .map((r) => `${r.provider}:${r.externalId}`));
  const cursor = details.cursor ?? { source: 0, query: 0, page: 0, pageToken: null };
  const ctx: IngestContext = { access: systemAccess(run.organizationId), run, profile, clientId: run.clientId };

  sources:
  for (let si = cursor.source; si < run.sources.length; si++) {
    const sourceId = run.sources[si]!;
    const stats = details.sources[sourceId] ??= emptyStats();
    if (stats.status === 'DONE' || stats.status === 'FAILED' || stats.status === 'NOT_CONFIGURED') continue;
    const def = connectorById(sourceId);
    const state = states.get(sourceId);
    if (!def?.discovery) { stats.status = 'FAILED'; stats.detail = 'Not a discovery source'; continue; }
    if (!state?.usable) {
      stats.status = 'NOT_CONFIGURED';
      stats.detail = state?.missingEnv.length ? `Set ${state.missingEnv.join(', ')} to connect it` : state && !state.enabled ? 'Turned off under Connectors' : 'Not available';
      continue;
    }
    stats.status = 'RUNNING';
    const queries = planQueries(plan, def.discovery.queryStyle);
    const resume = si === cursor.source;

    for (let qi = resume ? cursor.query : 0; qi < queries.length; qi++) {
      const resumeQuery = resume && qi === cursor.query;
      let page = resumeQuery ? cursor.page : 0;
      let pageToken = resumeQuery ? cursor.pageToken : null;

      while (page < def.discovery.maxPages) {
        if (counters.found >= plan.maxResultsPerRun) {
          details.stopReason = `Reached the limit of ${plan.maxResultsPerRun} results per run`;
          stats.status = 'DONE';
          break sources;
        }
        if (Date.now() + PAGE_TIME_MS > opts.deadline) {
          details.cursor = { source: si, query: qi, page, pageToken };
          await save();
          return { done: false };
        }
        const price = def.discovery.requestCost();
        if (spent + price.millicents > budget) {
          details.stopReason = "Stopped: this month's budget for the profile would be exceeded";
          stats.status = 'STOPPED';
          break sources;
        }
        try {
          await assertCategoryBudget(run.organizationId, 'discovery', price.millicents);
        } catch (err) {
          if (!(err instanceof CategoryBudgetError)) throw err;
          details.stopReason = err.message;
          stats.status = 'STOPPED';
          break sources;
        }

        const query: DiscoveryQuery = { ...queries[qi]!, pageToken };
        const search = def.discovery.search.bind(def.discovery);
        let result: Awaited<ReturnType<typeof search>>;
        try {
          // Shared per-provider budget and breaker: a provider that is down
          // or rate-limited pauses this run, not every run.
          result = await throttled(def.id, () => search(query), (r) => r.status === 'ERROR'
            ? { ok: false, error: r.error ?? 'Request failed', retryAfter: /\b429\b/.test(r.error ?? '') ? new Date(Date.now() + 60_000) : undefined }
            : { ok: true });
        } catch (err) {
          if (err instanceof ProviderUnavailableError) {
            details.cursor = { source: si, query: qi, page, pageToken };
            stats.detail = err.message;
            await save();
            return { done: false, retryAt: err.retryAt, reason: err.message };
          }
          result = { status: 'ERROR', costMillicents: 0, error: err instanceof Error ? err.message : 'Request failed', data: undefined };
        }
        stats.requests++;
        counters.queriesRun++;
        const before = spent;
        spent += result.costMillicents;
        counters.costMillicents += result.costMillicents;
        stats.costMillicents += result.costMillicents;
        if (price.isEstimate) details.costIsEstimate = true;
        await recordUsage({
          organizationId: run.organizationId, clientId: run.clientId, provider: def.id, type: 'DISCOVERY_REQUEST',
          costMillicents: result.costMillicents, isEstimate: price.isEstimate, operation: `${def.id}.search`,
          metadata: { runId: run.id, query: query.text, page, status: result.status },
        });
        noteBudget(details, before, spent, budget);

        if (result.status === 'ERROR') {
          stats.errors++;
          stats.detail = result.error?.slice(0, 300) ?? 'Request failed';
          logger.warn('discovery.request_failed', { runId: run.id, provider: def.id, error: result.error });
          // Bad credentials or a disabled API won't fix themselves mid-run.
          if (stats.errors >= 3 || /\b(401|403)\b/.test(result.error ?? '')) {
            stats.status = 'FAILED';
            details.cursor = { source: si + 1, query: 0, page: 0, pageToken: null };
            continue sources;
          }
          break; // next query
        }

        const fresh = (result.data?.companies ?? []).filter((c) => !seen.has(`${def.id}:${c.externalId}`));
        fresh.forEach((c) => seen.add(`${def.id}:${c.externalId}`));
        const batch = fresh.slice(0, plan.maxResultsPerRun - counters.found);
        stats.results += batch.length;
        const outcomes = await ingestPage(ctx, def, batch, query, plan);
        for (const o of outcomes) tally(counters, o);
        await save();

        pageToken = result.data?.nextPageToken ?? null;
        page++;
        if (!pageToken) break;
      }
      details.cursor = { source: si, query: qi + 1, page: 0, pageToken: null };
    }
    stats.status = 'DONE';
    details.cursor = { source: si + 1, query: 0, page: 0, pageToken: null };
  }

  details.cursor = null;
  await save();
  const all = Object.values(details.sources);
  const fresh = await db.discoveryRun.findUniqueOrThrow({ where: { id: run.id } });
  if (all.every((s) => s.status === 'NOT_CONFIGURED' || (s.status === 'FAILED' && s.requests === 0))) {
    await finishRun(fresh, 'FAILED', 'No discovery source is connected. Add a Google Places or Apollo API key, then check it under Connectors.');
  } else if (counters.queriesRun > 0 && all.every((s) => s.status !== 'DONE' && s.status !== 'STOPPED')) {
    await finishRun(fresh, 'FAILED', all.map((s) => s.detail).filter(Boolean).join(' · ') || 'Every search failed');
  } else {
    await finishRun(fresh, 'COMPLETED', null);
  }
  return { done: true };
}

function noteBudget(details: RunDetails, before: number, after: number, budget: number) {
  if (budget <= 0) return;
  for (const [pct, label] of [[0.5, 'Half'], [0.8, '80%']] as const) {
    if (before < budget * pct && after >= budget * pct) details.warnings.push(`${label} of this month's budget for the profile is used.`);
  }
}

async function finishRun(run: DiscoveryRun, status: 'COMPLETED' | 'FAILED' | 'CANCELLED', error: string | null) {
  const now = new Date();
  const updated = await db.discoveryRun.update({ where: { id: run.id }, data: { status, error, finishedAt: now } });
  if (run.profileId) {
    await db.discoveryProfile.update({ where: { id: run.profileId }, data: { lastRunAt: now, lastRunStatus: status } }).catch(() => undefined);
  }
  logger.info('discovery.run_finished', { runId: run.id, status, found: run.found, imported: run.imported });
  return updated;
}

// ---------------------------------------------------------------------------
// Turning results into accounts
// ---------------------------------------------------------------------------

interface IngestContext {
  access: AccessContext;
  run: DiscoveryRun;
  profile: DiscoveryProfile;
  clientId: string;
}

export interface IngestOutcome {
  outcome: DiscoveryOutcome;
  accountId: string | null;
  name: string;
  domain: string | null;
  matchScore: number | null;
  reason: string | null;
}

function tally(c: Counters, o: IngestOutcome) {
  c.found++;
  switch (o.outcome) {
    case 'CREATED': c.imported++; break;
    case 'NEEDS_REVIEW': c.imported++; c.needsReview++; break;
    case 'UPDATED': c.updated++; break;
    case 'DUPLICATE': c.duplicates++; break;
    case 'EXCLUDED': c.excluded++; break;
    case 'FAILED': c.failedCount++; break;
  }
}

async function ingestPage(ctx: IngestContext, def: ConnectorDefinition, companies: DiscoveredCompany[], query: DiscoveryQuery, plan: PlanningProfile) {
  const locateOnly = def.discovery!.storage === 'locate-only';
  // Cheap checks first, so known and excluded businesses never cost a site visit.
  const pending: Array<{ company: DiscoveredCompany; early: IngestOutcome | null }> = [];
  for (const company of companies) pending.push({ company, early: await precheck(ctx, def, company, plan, locateOnly) });

  const sites = new Map<string, Awaited<ReturnType<typeof readSite>>>();
  if (locateOnly) {
    const toRead = pending.filter((p) => !p.early && p.company.websiteUrl);
    await pool(toRead, SITE_CONCURRENCY, async (p) => { sites.set(p.company.externalId, await readSite(p.company.websiteUrl!)); });
  }

  const outcomes: IngestOutcome[] = [];
  for (const { company, early } of pending) {
    let outcome: IngestOutcome;
    try {
      outcome = early ?? await ingestOne(ctx, def, company, query, locateOnly ? sites.get(company.externalId) ?? null : null);
    } catch (err) {
      logger.error('discovery.ingest_failed', { runId: ctx.run.id, provider: def.id, error: err });
      outcome = { outcome: 'FAILED', accountId: null, name: locateOnly ? '' : company.name, domain: null, matchScore: null, reason: err instanceof Error ? err.message.slice(0, 300) : 'Failed' };
    }
    await db.discoveryResult.create({
      data: {
        organizationId: ctx.run.organizationId, runId: ctx.run.id, provider: def.id, externalId: company.externalId,
        name: outcome.name.slice(0, 200), domain: outcome.domain, outcome: outcome.outcome, matchScore: outcome.matchScore,
        reason: outcome.reason, accountId: outcome.accountId,
        // Only what may be kept: the source's own link for locate-only sources.
        payload: { sourceUrl: company.sourceUrl, query: query.text } as Prisma.InputJsonValue,
      },
    }).catch(() => undefined); // already recorded by an earlier step
    outcomes.push(outcome);
  }
  return outcomes;
}

const excluded = (company: DiscoveredCompany, reason: string, locateOnly: boolean, accountId: string | null = null): IngestOutcome =>
  ({ outcome: 'EXCLUDED', accountId, name: locateOnly ? '' : company.name, domain: null, matchScore: null, reason });

/** Exclusion rules and businesses this client already has under the source's id. */
async function precheck(ctx: IngestContext, def: ConnectorDefinition, company: DiscoveredCompany, plan: PlanningProfile, locateOnly: boolean): Promise<IngestOutcome | null> {
  const rule = exclusionReason(company, plan);
  if (rule) return excluded(company, rule, locateOnly);

  const known = await db.discoveryIdentifier.findUnique({
    where: { clientId_provider_externalId: { clientId: ctx.clientId, provider: def.id, externalId: company.externalId } },
    select: { account: { select: { id: true, name: true, domain: true, deletedAt: true, archiveReason: true, mergedIntoId: true } } },
  });
  if (known) {
    let account = known.account;
    // Follow merges to the surviving record.
    for (let hops = 0; account.mergedIntoId && hops < 5; hops++) {
      const next = await db.account.findUnique({ where: { id: account.mergedIntoId }, select: { id: true, name: true, domain: true, deletedAt: true, archiveReason: true, mergedIntoId: true } });
      if (!next) break;
      account = next;
    }
    if (account.deletedAt) return excluded(company, 'Archived earlier by a person', locateOnly, account.id);
    return { outcome: 'DUPLICATE', accountId: account.id, name: account.name, domain: account.domain, matchScore: 1, reason: 'Already on file from this source' };
  }

  if (locateOnly) {
    if (!company.websiteUrl) return excluded(company, 'No website listed, so there is no first-party record to build from', true);
    if (!canonicalDomain(company.websiteUrl)) return excluded(company, 'Only a social media or directory page is listed', true);
  }
  return null;
}

async function readSite(url: string) {
  const timeout = new Promise<{ identity: null; reason: string }>((resolve) =>
    setTimeout(() => resolve({ identity: null, reason: 'Website took too long to respond' }), SITE_TIMEOUT_MS));
  return Promise.race([readSiteIdentity(url).catch(() => ({ identity: null, reason: 'Website could not be read' })), timeout]);
}

async function ingestOne(
  ctx: IngestContext,
  def: ConnectorDefinition,
  company: DiscoveredCompany,
  query: DiscoveryQuery,
  site: { identity: SiteIdentity | null; reason: string | null } | null,
): Promise<IngestOutcome> {
  const locateOnly = def.discovery!.storage === 'locate-only';
  const built = locateOnly ? fromSite(company, site) : fromLicensed(company);
  if ('reason' in built) return excluded(company, built.reason, locateOnly);
  const { input, sourceInfo } = built;
  const domain = canonicalDomain(input.websiteUrl);

  if (domain) {
    const blocked = await findSuppression({ organizationId: ctx.run.organizationId, clientId: ctx.clientId, channel: 'EMAIL', domain });
    if (blocked) return { ...excluded(company, 'On the do-not-contact list', false), name: input.name, domain };
  }
  const normalizedName = normalizeCompanyName(input.name);
  const archived = await db.account.findFirst({
    where: { clientId: ctx.clientId, deletedAt: { not: null }, archiveReason: 'USER', normalizedName, ...(input.city ? { city: { equals: input.city, mode: 'insensitive' } } : {}) },
    select: { id: true },
  });
  if (archived) return { ...excluded(company, 'Archived earlier by a person', false, archived.id), name: input.name, domain };

  const result = await createAccount(ctx.access, null, {
    ...input,
    clientId: ctx.clientId,
    identifiers: [{ provider: def.id, externalId: company.externalId }],
  } as AccountInput, { ...sourceInfo, discoveryRunId: ctx.run.id });

  if (result.status === 'excluded') return { ...excluded(company, result.reason, false), name: input.name, domain };

  await applySearchContext(ctx, result.accountId, def, company, query);
  if (result.status === 'created' && ctx.profile.autoResearch && input.websiteUrl) {
    await db.research.upsert({
      where: { accountId: result.accountId },
      create: { accountId: result.accountId, organizationId: ctx.run.organizationId, clientId: ctx.clientId, status: 'QUEUED' },
      update: {},
    });
  }

  if (result.status === 'created') {
    return {
      outcome: result.review ? 'NEEDS_REVIEW' : 'CREATED', accountId: result.accountId, name: input.name, domain,
      matchScore: result.review?.score ?? null, reason: result.review ? 'Looks like an account already on file; flagged for review' : null,
    };
  }
  return {
    outcome: result.filled.length ? 'UPDATED' : 'DUPLICATE', accountId: result.accountId, name: input.name, domain, matchScore: result.score,
    reason: result.filled.length ? `Matched an existing account; added ${result.filled.join(', ')}` : 'Matched an existing account',
  };
}

type Built = { input: Omit<AccountInput, 'clientId'>; sourceInfo: AccountSourceInfo } | { reason: string };

/** Account fields from the business's own website (locate-only sources). */
function fromSite(company: DiscoveredCompany, site: { identity: SiteIdentity | null; reason: string | null } | null): Built {
  if (!site?.identity) return { reason: site?.reason ?? 'Website could not be read' };
  const identity = site.identity;
  const confirmed = confirmName(identity, company.name);
  if (!confirmed) return { reason: "The website doesn't confirm the business name; the listing may point to the wrong site" };
  const address = identity.address;
  let origin: string;
  try { origin = new URL(identity.url).origin; } catch { return { reason: 'Website address is not valid' }; }
  return {
    input: {
      name: confirmed.name.slice(0, 200),
      websiteUrl: origin,
      phone: identity.phone,
      description: identity.description,
      addressLine: address?.street ?? null,
      city: address?.city ?? null,
      region: address?.region ?? null,
      postalCode: address?.postalCode ?? null,
      country: address?.country ?? null,
      socialProfiles: Object.keys(identity.socialProfiles).length ? identity.socialProfiles as AccountInput['socialProfiles'] : null,
      source: 'GOOGLE_PLACES',
      sourceRef: company.externalId.slice(0, 200),
      tags: [],
      contacts: [],
    },
    sourceInfo: { provider: 'company_website', provenanceSource: 'COMPANY_WEBSITE', sourceUrl: identity.url, label: 'discovery (Google Places, details from the company website)' },
  };
}

/** Account fields straight from a licensed source. */
function fromLicensed(company: DiscoveredCompany): Built {
  return {
    input: {
      name: company.name.slice(0, 200),
      websiteUrl: company.websiteUrl?.slice(0, 300) ?? null,
      phone: company.phone?.slice(0, 40) ?? null,
      industry: company.industry?.slice(0, 120) ?? null,
      employeeCount: company.employeeCount,
      description: company.description?.slice(0, 4000) ?? null,
      foundedYear: company.foundedYear,
      linkedinUrl: company.linkedinUrl?.slice(0, 300) ?? null,
      addressLine: company.addressLine?.slice(0, 200) ?? null,
      city: company.city?.slice(0, 80) ?? null,
      region: company.region?.slice(0, 80) ?? null,
      postalCode: company.postalCode?.slice(0, 20) ?? null,
      country: company.country?.slice(0, 80) ?? null,
      source: 'APOLLO',
      sourceRef: company.externalId.slice(0, 200),
      tags: [],
      contacts: [],
    },
    sourceInfo: { provider: 'apollo', label: 'discovery (Apollo)' },
  };
}

/**
 * What the search itself says, filled only where the account has nothing
 * better: the category and area you searched (your own input, marked as
 * unconfirmed), and coordinates from a source that allows caching them for a
 * limited time.
 */
async function applySearchContext(ctx: IngestContext, accountId: string, def: ConnectorDefinition, company: DiscoveredCompany, query: DiscoveryQuery) {
  const account = await db.account.findUnique({ where: { id: accountId }, select: { industry: true, city: true, region: true, latitude: true, longitude: true } });
  if (!account) return;
  const searched: Record<string, string> = {};
  if (!account.industry && query.industry) searched.industry = query.industry.slice(0, 120);
  if (!account.city && query.city) searched.city = query.city;
  if (!account.region && query.region) searched.region = query.region;
  if (Object.keys(searched).length) {
    await db.account.update({ where: { id: accountId }, data: searched });
    await recordProvenance({ organizationId: ctx.run.organizationId, accountId }, searched, { source: 'OTHER', provider: 'discovery_search', status: 'UNVERIFIED', confidence: 0.5 });
  }
  const days = def.discovery!.coordinateRetentionDays;
  if (days && account.latitude === null && company.latitude !== null && company.longitude !== null) {
    await db.account.update({ where: { id: accountId }, data: { latitude: company.latitude, longitude: company.longitude } });
    await recordProvenance(
      { organizationId: ctx.run.organizationId, accountId },
      { latitude: company.latitude, longitude: company.longitude },
      { source: def.discovery!.source, provider: def.id, status: 'PROVIDER_REPORTED', retentionUntil: new Date(Date.now() + days * 86_400_000) },
    );
  }
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]!);
  }));
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export function listRuns(access: AccessContext, params: { profileId?: string | null; clientId?: string | null; limit?: number }) {
  return db.discoveryRun.findMany({
    where: {
      organizationId: access.organizationId,
      ...(params.profileId ? { profileId: params.profileId } : {}),
      ...(params.clientId ? { clientId: params.clientId } : access.clients.kind === 'all' ? {} : { clientId: { in: [...access.clients.ids] } }),
    },
    orderBy: { createdAt: 'desc' },
    take: params.limit ?? 25,
    include: { profile: { select: { id: true, name: true } } },
  });
}

export async function getRun(access: AccessContext, id: string) {
  const run = await db.discoveryRun.findFirst({ where: { id, organizationId: access.organizationId }, include: { profile: { select: { id: true, name: true } } } });
  if (!run) throw new NotFoundError('Discovery run');
  if (run.clientId) assertClientAccess(access, run.clientId);
  return { ...run, parsedDetails: readDetails(run.details, run.sources) };
}

export async function listRunResults(access: AccessContext, runId: string, params: { outcome?: DiscoveryOutcome | null; cursor?: string | null; limit?: number }) {
  await getRun(access, runId);
  const limit = params.limit ?? 50;
  const rows = await db.discoveryResult.findMany({
    where: { runId, ...(params.outcome ? { outcome: params.outcome } : {}) },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });
  return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit]!.id : null };
}

/** Profiles whose schedule is due: start a run and move the schedule on. */
export async function scheduleDueDiscovery(now = new Date()) {
  const due = await db.discoveryProfile.findMany({
    where: { isActive: true, archivedAt: null, frequency: { not: 'MANUAL' }, nextRunAt: { lte: now } },
    take: 50,
  });
  let started = 0;
  for (const p of due) {
    // Move the schedule first, so a slow or failing start can't fire twice.
    await db.discoveryProfile.update({ where: { id: p.id }, data: { nextRunAt: nextRunAfter(p.frequency, now) } });
    try {
      const r = await startDiscoveryRun(systemAccess(p.organizationId), null, p.id, 'SCHEDULE');
      if (r.started) started++;
    } catch (err) {
      logger.error('discovery.schedule_failed', { profileId: p.id, error: err });
    }
  }
  return { due: due.length, started };
}
