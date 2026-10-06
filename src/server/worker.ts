import { hostname } from 'node:os';
import type { Job } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { runResearch } from './ai/research';
import { BudgetExceededError } from './ai/budget';
import { systemAccess } from './access/scope';
import { NotConfiguredError } from './errors';
import { runSequencer } from './services/sequencer';
import { enforceContextualGuardrail } from './services/tier-performance';
import { rescoreAccount } from './services/scoring';
import { refreshQueue } from './services/call-queue';
import { claimJobs, completeJob, failJob, releaseStaleJobs } from './services/jobs';
import { discoverContacts, enrichAccount } from './services/enrichment';

/**
 * The background worker. Claims work with FOR UPDATE SKIP LOCKED so several
 * worker processes can run without coordination and without a queue service —
 * a claim is transactional with the row it operates on, and a crashed worker
 * releases its lock rather than stranding a job.
 *
 * Each cycle: research queue, generic jobs, stale scores, sequencing, and on
 * slower clocks the call-queue refresh and daily guardrails.
 *
 * Run with: npm run worker
 */
const POLL_INTERVAL_MS = 15_000;
const RESEARCH_CONCURRENCY = 2;
const JOB_CONCURRENCY = 4;
const RESCORE_BATCH = 50;
const WORKER_ID = `${hostname()}:${process.pid}`;

let shuttingDown = false;

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

async function processResearch() {
  const jobs = await claimResearchJobs(RESEARCH_CONCURRENCY);
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
// Generic jobs
// ---------------------------------------------------------------------------

type Handler = (job: Job) => Promise<unknown>;

function requireOrg(job: Job) {
  if (!job.organizationId) throw new Error('Job has no organization');
  return systemAccess(job.organizationId);
}

const HANDLERS: Partial<Record<Job['type'], Handler>> = {
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
};

async function processJobs() {
  const jobs = await claimJobs(WORKER_ID, JOB_CONCURRENCY);
  await Promise.all(jobs.map(async (job) => {
    const handler = HANDLERS[job.type];
    if (!handler) {
      await failJob(job, new Error(`No handler for ${job.type}`), { retryable: false });
      return;
    }
    try {
      const result = await handler(job);
      await completeJob(job.id, (result ?? null) as never);
    } catch (err) {
      // Missing configuration will not fix itself by retrying.
      const retryable = !(err instanceof NotConfiguredError);
      if (err instanceof BudgetExceededError) {
        await db.job.update({ where: { id: job.id }, data: { status: 'RETRYING', runAt: new Date(Date.now() + 3600_000), error: err.message, lockedAt: null, lockedBy: null } });
        return;
      }
      await failJob(job, err, { retryable });
      logger.error('job.failed', { jobId: job.id, type: job.type, error: err });
    }
  }));
  return jobs.length;
}

// ---------------------------------------------------------------------------
// Stale scores (ICP changes and migrations mark scores stale with scoredAt = null)
// ---------------------------------------------------------------------------

async function processStaleScores() {
  const stale = await db.account.findMany({
    where: { scoredAt: null, deletedAt: null },
    select: { id: true },
    take: RESCORE_BATCH,
  });
  for (const a of stale) {
    try { await rescoreAccount(a.id); } catch (err) { logger.error('rescore.failed', { accountId: a.id, error: err }); }
  }
  return stale.length;
}

// ---------------------------------------------------------------------------
// Sequencing, per workspace
// ---------------------------------------------------------------------------

/**
 * Iterating tenants explicitly — rather than one global query — keeps one
 * noisy workspace from starving the others and makes per-workspace sending
 * windows and caps enforceable.
 */
async function processSequences() {
  const orgs = await db.organization.findMany({
    where: { deletedAt: null, campaigns: { some: { status: 'ACTIVE' } } },
    select: { id: true, name: true },
  });
  for (const org of orgs) {
    try {
      const result = await runSequencer(org.id);
      if (result.drafted || result.sent || result.blocked) {
        logger.info('sequencer.cycle', { organization: org.name, ...result, skipped: result.skipped.length });
      }
    } catch (err) {
      logger.error('sequencer.error', { organization: org.name, error: err });
    }
  }
}

// ---------------------------------------------------------------------------
// Slower clocks
// ---------------------------------------------------------------------------

const HOUR = 3600_000;
let lastQueueRefresh = 0;
let lastDaily = 0;

async function processPeriodic() {
  if (Date.now() - lastQueueRefresh >= HOUR) {
    lastQueueRefresh = Date.now();
    await releaseStaleJobs();
    const orgs = await db.organization.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
    for (const org of orgs) {
      try {
        const r = await refreshQueue(org.id);
        if (r.queued) logger.info('call_queue.refreshed', { organization: org.name, ...r });
      } catch (err) {
        logger.error('call_queue.refresh_failed', { organization: org.name, error: err });
      }
    }
  }

  // Daily: is industry-only sending still earning its keep?
  if (Date.now() - lastDaily >= 24 * HOUR) {
    lastDaily = Date.now();
    const orgs = await db.organization.findMany({ where: { deletedAt: null, allowContextual: true }, select: { id: true, name: true } });
    for (const org of orgs) {
      try {
        const outcome = await enforceContextualGuardrail(org.id);
        if (outcome.changed) logger.warn('guardrail.contextual_disabled', { organization: org.name, reason: outcome.reason });
      } catch (err) {
        logger.error('guardrail.error', { organization: org.name, error: err });
      }
    }
  }
}

async function loop() {
  logger.info('worker.started', { workerId: WORKER_ID });
  while (!shuttingDown) {
    try {
      const research = await processResearch();
      const jobs = await processJobs();
      const rescored = await processStaleScores();
      await processSequences();
      await processPeriodic();
      // Back off only when idle; keep draining while there's work.
      if (research + jobs + rescored === 0) await sleep(POLL_INTERVAL_MS);
    } catch (err) {
      logger.error('worker.loop_error', { error: err });
      await sleep(POLL_INTERVAL_MS);
    }
  }
  await db.$disconnect();
  logger.info('worker.stopped', { workerId: WORKER_ID });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info('worker.stopping', { signal });
    shuttingDown = true;
  });
}

loop().catch((err) => {
  logger.error('worker.crashed', { error: err });
  process.exit(1);
});
