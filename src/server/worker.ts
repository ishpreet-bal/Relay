import { hostname } from 'node:os';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { runSequencer } from './services/sequencer';
import { enforceContextualGuardrail } from './services/tier-performance';
import { refreshQueue } from './services/call-queue';
import { processJobs, processResearch, processStaleScores } from './services/job-runner';
import { scheduledMaintenance } from './services/scheduler';

/**
 * The background worker. Claims work with FOR UPDATE SKIP LOCKED so several
 * worker processes can run without coordination and without a queue service —
 * a claim is transactional with the row it operates on, and a crashed worker
 * releases its lock rather than stranding a job.
 *
 * Each cycle: research queue, generic jobs, stale scores, sequencing, and on
 * slower clocks scheduled discovery and maintenance, the call-queue refresh
 * and daily guardrails. Job execution itself lives in services/job-runner so
 * the cron tick can share it when no worker is deployed.
 *
 * Run with: npm run worker
 */
const POLL_INTERVAL_MS = 15_000;
const RESEARCH_CONCURRENCY = 2;
const JOB_CONCURRENCY = 4;
const RESCORE_BATCH = 50;
const WORKER_ID = `${hostname()}:${process.pid}`;
/** How long one job may run before pausable work (discovery) yields. */
const JOB_SLICE_MS = 4 * 60_000;

let shuttingDown = false;

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
let lastMaintenance = 0;
let lastDaily = 0;

async function processPeriodic() {
  if (Date.now() - lastMaintenance >= 15 * 60_000) {
    lastMaintenance = Date.now();
    // Due discovery schedules, company-key backfill, retention sweep.
    try { await scheduledMaintenance(); } catch (err) { logger.error('maintenance.error', { error: err }); }
  }

  if (Date.now() - lastQueueRefresh >= HOUR) {
    lastQueueRefresh = Date.now();
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
      const research = await processResearch(RESEARCH_CONCURRENCY);
      const jobs = await processJobs(WORKER_ID, JOB_CONCURRENCY, { deadline: Date.now() + JOB_SLICE_MS });
      const rescored = await processStaleScores(RESCORE_BATCH);
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
