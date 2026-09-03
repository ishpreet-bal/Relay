import { db } from '@/lib/db';
import { runResearch } from './ai/research';
import { runSequencer } from './services/sequencer';
import { enforceContextualGuardrail } from './services/tier-performance';
import { BudgetExceededError } from './ai/budget';

/**
 * The background worker. Claims work with FOR UPDATE SKIP LOCKED so multiple
 * worker processes can run without coordination and without a queue service —
 * the claim is transactional with the row it operates on, which means a crashed
 * worker releases its lock rather than stranding a job.
 *
 * Run with: npm run worker
 */
const POLL_INTERVAL_MS = 15_000;
const RESEARCH_CONCURRENCY = 2;

let shuttingDown = false;

interface Claimed { id: string; leadId: string; organizationId: string }

async function claimResearchJobs(limit: number): Promise<Claimed[]> {
  return db.$queryRaw<Claimed[]>`
    UPDATE "Research"
    SET status = 'RUNNING', "updatedAt" = NOW()
    WHERE id IN (
      SELECT id FROM "Research"
      WHERE status = 'QUEUED'
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "leadId", "organizationId";
  `;
}

async function processResearch() {
  const jobs = await claimResearchJobs(RESEARCH_CONCURRENCY);
  if (!jobs.length) return 0;

  await Promise.all(
    jobs.map(async (job) => {
      try {
        await runResearch(job.organizationId, job.leadId);
        console.log(`✓ research ${job.leadId}`);
      } catch (err) {
        if (err instanceof BudgetExceededError) {
          // Budget failures are not the lead's fault. Put it back in the queue
          // so it resumes next month or after the cap is raised.
          await db.research.update({
            where: { id: job.id },
            data: { status: 'QUEUED', error: err.message },
          });
          console.warn(`⏸ budget exhausted, requeued ${job.leadId}`);
          return;
        }
        console.error(`✗ research ${job.leadId}:`, err instanceof Error ? err.message : err);
      }
    }),
  );
  return jobs.length;
}

/**
 * Sequencing runs per organization. Iterating tenants explicitly — rather than
 * one global query — keeps one noisy workspace from starving the others and
 * makes per-org sending windows and caps enforceable.
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
        console.log(`[${org.name}] drafted ${result.drafted}, sent ${result.sent}, blocked ${result.blocked}`);
      }
    } catch (err) {
      console.error(`[${org.name}] sequencer error:`, err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Daily housekeeping. Currently one job: check whether industry-only sending is
 * still earning its keep and turn it off if the data says otherwise.
 */
let lastGuardrailRun = 0;
async function processDailyChecks() {
  const DAY = 24 * 3600_000;
  if (Date.now() - lastGuardrailRun < DAY) return;
  lastGuardrailRun = Date.now();

  const orgs = await db.organization.findMany({
    where: { deletedAt: null, allowContextual: true },
    select: { id: true, name: true },
  });
  for (const org of orgs) {
    try {
      const outcome = await enforceContextualGuardrail(org.id);
      if (outcome.changed) console.log(`[${org.name}] industry-only sending disabled: ${outcome.reason}`);
    } catch (err) {
      console.error(`[${org.name}] guardrail error:`, err instanceof Error ? err.message : err);
    }
  }
}

async function loop() {
  console.log('Foundry worker started');
  while (!shuttingDown) {
    try {
      const processed = await processResearch();
      await processSequences();
      await processDailyChecks();
      // Back off only when idle; keep draining while there's work.
      if (processed === 0) await sleep(POLL_INTERVAL_MS);
    } catch (err) {
      console.error('Worker loop error:', err);
      await sleep(POLL_INTERVAL_MS);
    }
  }
  await db.$disconnect();
  console.log('Foundry worker stopped');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, finishing current jobs…`);
    shuttingDown = true;
  });
}

loop().catch((err) => {
  console.error('Worker crashed:', err);
  process.exit(1);
});
