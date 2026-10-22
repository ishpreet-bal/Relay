import { hostname } from 'node:os';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { runSequencer } from './services/sequencer';
import { enforceContextualGuardrail } from './services/tier-performance';
import { refreshQueue } from './services/call-queue';
import { heartbeat, processGroup, processResearch, processStaleScores } from './services/job-runner';
import { scheduledMaintenance } from './services/scheduler';
import type { WorkerGroup } from './queues/registry';

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
 * Run with: npm run worker                      (every queue)
 *           npm run worker -- --group=studio      (customer workflows and billing only)
 *           npm run worker -- --group=intelligence (prospecting: discovery, research, outreach)
 * Running studio in its own process keeps a prospecting backlog from ever
 * delaying a paying customer's automation.
 */
const GROUP = parseGroup(process.argv.find((a) => a.startsWith('--group='))?.split('=')[1] ?? process.env.WORKER_GROUP ?? 'all');
const RUNS_INTELLIGENCE = GROUP === 'all' || GROUP === 'intelligence';
const RUNS_PLATFORM = GROUP === 'all' || GROUP === 'platform' || GROUP === 'intelligence';

function parseGroup(v: string): WorkerGroup | 'all' {
  if (v === 'all' || v === 'intelligence' || v === 'studio' || v === 'platform') return v;
  throw new Error(`Unknown worker group "${v}" (expected all, intelligence, studio or platform)`);
}
const POLL_INTERVAL_MS = 15_000;
const RESEARCH_CONCURRENCY = 2;
const JOB_CONCURRENCY = 4;
const RESCORE_BATCH = 50;
const WORKER_ID = `${GROUP}@${hostname()}:${process.pid}`;
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
  logger.info('worker.started', { workerId: WORKER_ID, group: GROUP });
  while (!shuttingDown) {
    try {
      const research = RUNS_INTELLIGENCE ? await processResearch(RESEARCH_CONCURRENCY) : 0;
      const jobs = await processGroup(WORKER_ID, GROUP, JOB_CONCURRENCY, { deadline: Date.now() + JOB_SLICE_MS });
      const rescored = RUNS_INTELLIGENCE ? await processStaleScores(RESCORE_BATCH) : 0;
      if (RUNS_INTELLIGENCE) await processSequences();
      if (RUNS_PLATFORM) await processPeriodic();
      await heartbeat(WORKER_ID, GROUP, research + jobs + rescored, null);
      // Back off only when idle; keep draining while there's work.
      if (research + jobs + rescored === 0) await sleep(POLL_INTERVAL_MS);
    } catch (err) {
      logger.error('worker.loop_error', { error: err });
      await heartbeat(WORKER_ID, GROUP, 0, err instanceof Error ? err.message.slice(0, 500) : String(err));
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
