import type { Job, JobType } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { runResearch } from '@/server/ai/research';
import { BudgetExceededError } from '@/server/ai/budget';
import { systemAccess } from '@/server/access/scope';
import { NotConfiguredError } from '@/server/errors';
import { runInJob } from '@/server/queues/context';
import { queuesFor, type QueueName, type WorkerGroup } from '@/server/queues/registry';
import { runtimeFor } from '@/server/queues/settings';
import { ProviderUnavailableError, throttled } from '@/server/queues/throttle';
import { rescoreAccount } from './scoring';
import { refreshQueue } from './call-queue';
import { claimJob, claimJobs, completeJob, failJob, requeueJob, settleTimedOutAttempt } from './jobs';
import { resolveAccountContacts } from './contact-resolution';
import { discoverContacts, enrichAccount } from './enrichment';
import { executeDiscoveryStep } from './discovery/run';
import { sweepRetention } from './discovery/retention';
import { backfillCompanyKeys } from './companies/backfill';
import { createAccount } from './accounts';
import { screenAccounts, type Trigger } from './pipeline/gates';
import { refreshAccount } from './pipeline/refresh';
import { runDeepResearch } from './pipeline/deep';
import { runExecution } from '@/server/studio/executor';

/**
 * Executing queued work, shared by everything that can drive it: the
 * long-running worker (npm run worker, one process per worker group), the
 * scheduled cron tick, and pages that move a run forward while someone
 * watches it. Every attempt runs under its queue's timeout and inside a job
 * context, so the costs it incurs are attributed to it.
 */

export interface RunContext {
  /** Epoch ms by which the handler should have returned. */
  deadline: number;
}

/** Returned by a handler that made progress and wants to continue later. */
export class Continue {
  constructor(public runAt = new Date(), public reason: string | null = null) {}
}

export class JobTimeoutError extends Error {
  constructor(ms: number) {
    super(`Attempt exceeded its ${Math.round(ms / 1000)}s time limit`);
    this.name = 'JobTimeoutError';
  }
}

type Handler = (job: Job, ctx: RunContext) => Promise<unknown>;

/** Time a contact job needs left on the clock before it reads a website itself. */
const WEBSITE_READ_MIN_MS = 75_000;

const payloadOf = <T>(job: Job) => (job.payload ?? {}) as T;

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
  CONTACT_ENRICHMENT: (job, ctx) => payloadOf<{ resolve?: boolean }>(job).resolve
    // Reading the site takes up to a minute at one polite request a second:
    // only when this runner has the time (the worker does, a cron tick doesn't).
    ? resolveAccountContacts(requireOrg(job), job.entityId!, 3, { readWebsite: ctx.deadline - Date.now() > WEBSITE_READ_MIN_MS })
    : discoverContacts(requireOrg(job), job.entityId!, Number((job.payload as { limit?: number } | null)?.limit ?? 5)),
  RESEARCH: (job) => runResearch(requireOrg(job).organizationId, job.entityId!, { trigger: payloadOf<{ trigger?: Trigger }>(job).trigger ?? 'MANUAL' })
    .then((r) => ({ signals: r.signalsCreated, groundingRate: r.report.groundingRate })),
  SCREENING: (job) => screenAccounts(requireOrg(job).organizationId, payloadOf<{ accountIds?: string[] }>(job).accountIds ?? (job.entityId ? [job.entityId] : [])),
  RECORD_REFRESH: (job) => refreshAccount(requireOrg(job).organizationId, job.entityId!),
  DEEP_RESEARCH: (job) => runDeepResearch(requireOrg(job).organizationId, job.entityId!, payloadOf<{ trigger?: string }>(job).trigger ?? 'MANUAL'),
  DISCOVERY_RUN: async (job, ctx) => {
    const step = await executeDiscoveryStep(job.entityId!, { deadline: ctx.deadline });
    if (step.done) return { runId: job.entityId };
    return new Continue(step.retryAt ?? new Date(), step.reason ?? null);
  },
  RETENTION_SWEEP: () => sweepRetention(),
  MAINTENANCE: () => backfillCompanyKeys(),
  SYNTHETIC_TASK: (job) => runSyntheticTask(job),
  WORKFLOW_EXECUTION: async (job) => {
    try {
      const r = await runExecution(job.entityId!);
      return r.done ? { executionId: job.entityId } : new Continue(r.retryAt ?? new Date(), r.reason ?? null);
    } catch (err) {
      // Out of retries: the customer sees a failed run, not one stuck running.
      if (job.attempts >= job.maxAttempts) {
        await db.workflowExecution.updateMany({
          where: { id: job.entityId!, status: { in: ['QUEUED', 'RUNNING'] } },
          data: { status: 'FAILED', error: (err instanceof Error ? err.message : String(err)).slice(0, 1000), finishedAt: new Date() },
        });
      }
      throw err;
    }
  },
};

async function withTimeout<T>(work: Promise<T>, ms: number, onLateSettle: () => void): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  let timedOut = false;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { timedOut = true; reject(new JobTimeoutError(ms)); }, ms);
  });
  // Work that outlives its timeout keeps running; say when it finally stops.
  work.then(() => undefined, () => undefined).then(() => { if (timedOut) onLateSettle(); });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function execute(job: Job, ctx: RunContext, workerId: string) {
  const handler = HANDLERS[job.type];
  if (!handler) {
    await failJob(job, new Error(`No handler for ${job.type}`), { retryable: false });
    return;
  }
  const q = await runtimeFor(job.queue);
  const timeoutMs = q?.timeoutMs ?? 5 * 60_000;
  // Pausable handlers aim to return well inside the hard limit.
  const deadline = Math.min(ctx.deadline, Date.now() + Math.floor(timeoutMs * 0.9));
  try {
    const result = await runInJob({ jobId: job.id, queue: job.queue, workerId }, () => withTimeout(
      handler(job, { deadline }), timeoutMs,
      () => { void settleTimedOutAttempt(job.id, job.attempts).catch((err) => logger.warn('job.settle_failed', { jobId: job.id, error: err })); },
    ));
    if (result instanceof Continue) await requeueJob(job.id, result.runAt, result.reason);
    else await completeJob(job.id, (result ?? null) as never);
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      // The provider is paused, not the job: wait it out without using an attempt.
      await requeueJob(job.id, err.retryAt, err.message);
      return;
    }
    if (err instanceof BudgetExceededError) {
      await requeueJob(job.id, new Date(Date.now() + 3600_000), err.message);
      return;
    }
    // A timed-out attempt's work can't be cancelled mid-flight in Node: it
    // keeps its concurrency slot until it settles, and handlers are
    // idempotent, so a retry running alongside it is safe.
    const timedOut = err instanceof JobTimeoutError;
    await failJob(job, err, { retryable: !(err instanceof NotConfiguredError), timedOut });
    logger.error('job.failed', { jobId: job.id, type: job.type, queue: job.queue, error: err });
  }
}

let rotation = 0;

/**
 * Claims and runs up to `concurrency` jobs from the given queues, starting
 * from a different queue each call so no queue is permanently first.
 */
export async function processQueues(workerId: string, queues: QueueName[], concurrency: number, ctx: RunContext) {
  if (!queues.length) return 0;
  const start = rotation++ % queues.length;
  const ordered = [...queues.slice(start), ...queues.slice(0, start)];
  const jobs = await claimJobs(workerId, concurrency, ordered);
  await Promise.all(jobs.map((job) => execute(job, ctx, workerId)));
  return jobs.length;
}

export async function processGroup(workerId: string, group: WorkerGroup | 'all', concurrency: number, ctx: RunContext) {
  return processQueues(workerId, queuesFor(group), concurrency, ctx);
}

/** Runs one specific job now, if nobody else holds it and its queue has room. */
export async function runJobNow(jobId: string, workerId: string, ctx: RunContext) {
  // A step holds its job for under a minute; one silent for three has died.
  const job = await claimJob(jobId, workerId, 3 * 60_000);
  if (!job) return false;
  await execute(job, ctx, workerId);
  return true;
}

/** Records that a worker is alive and what it has done. */
export async function heartbeat(workerId: string, group: string, processed: number, error?: string | null) {
  await db.workerHeartbeat.upsert({
    where: { workerId },
    create: { workerId, group, jobsProcessed: processed, lastError: error ?? null, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null },
    update: { lastSeenAt: new Date(), jobsProcessed: { increment: processed }, ...(error !== undefined ? { lastError: error } : {}) },
  }).catch((err) => logger.warn('worker.heartbeat_failed', { workerId, error: err }));
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
  const q = await runtimeFor('research');
  if (q?.paused) return 0;
  const jobs = await claimResearchJobs(Math.min(concurrency, q?.concurrency ?? concurrency));
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

// ---------------------------------------------------------------------------
// Synthetic load (queue validation only)
// ---------------------------------------------------------------------------

export interface SyntheticPayload {
  /** Which synthetic company to write; several tasks may share one, to test deduplication. */
  companyIndex: number;
  /** Throw before writing on attempts up to this number. */
  failBeforeWriteAttempts?: number;
  /** Throw after writing on the first attempt: the retry must not duplicate the write. */
  failAfterWriteOnce?: boolean;
  /** Sleep this long on the first attempt (beyond the queue timeout to test timeouts). */
  hangFirstAttemptMs?: number;
  /** Always fail: ends as a dead letter. */
  permanent?: boolean;
  /** Call this synthetic provider through the shared throttle first. */
  provider?: string;
  /** The synthetic provider call fails. */
  providerFails?: boolean;
  workMs?: number;
}

/** Live counters for tests: how many synthetic tasks run at once. */
export const syntheticProbe = { active: 0, maxActive: 0, writes: 0 };

async function runSyntheticTask(job: Job) {
  const p = (job.payload ?? {}) as unknown as SyntheticPayload;
  const client = job.clientId ? await db.client.findUnique({ where: { id: job.clientId }, select: { id: true, slug: true, organizationId: true } }) : null;
  // Only ever acts on clients created for synthetic testing.
  if (!client || !client.slug.startsWith('synthetic-')) throw new NotConfiguredError('synthetic', 'Synthetic tasks only run against synthetic clients.');

  syntheticProbe.active++;
  syntheticProbe.maxActive = Math.max(syntheticProbe.maxActive, syntheticProbe.active);
  try {
    if (p.hangFirstAttemptMs && job.attempts === 1) await new Promise((r) => setTimeout(r, p.hangFirstAttemptMs));
    if (p.workMs) await new Promise((r) => setTimeout(r, p.workMs));
    if (p.permanent) throw new Error('Synthetic permanent failure');
    if (p.failBeforeWriteAttempts && job.attempts <= p.failBeforeWriteAttempts) throw new Error(`Synthetic failure before write (attempt ${job.attempts})`);
    if (p.provider) {
      await throttled(p.provider, async () => {
        if (p.providerFails) throw new Error(`${p.provider} returned 503`);
        return true;
      });
    }
    const result = await createAccount(systemAccess(client.organizationId), null, {
      clientId: client.id,
      name: `Synthetic Company ${p.companyIndex}`,
      websiteUrl: `https://synthetic-company-${p.companyIndex}.test`,
      source: 'OTHER',
      identifiers: [{ provider: 'synthetic', externalId: String(p.companyIndex) }],
    }, { label: 'synthetic load test' });
    syntheticProbe.writes++;
    if (p.failAfterWriteOnce && job.attempts === 1) throw new Error('Synthetic failure after write');
    return { status: result.status };
  } finally {
    syntheticProbe.active--;
  }
}
