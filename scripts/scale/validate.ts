/**
 * Scale validation (brief 2, phase G). Measures, on whatever database
 * DATABASE_URL points at, with synthetic data in a throwaway workspace:
 *
 *   1. bulk load of synthetic companies
 *   2. screening throughput through the real screening queue and workers
 *   3. read latency at that size: funnel metrics, lead explorer queries
 *   4. dedup matching latency against the full table
 *   5. job queue throughput (synthetic tasks) with N workers
 *   6. customer workflow throughput across many applications, with per-app
 *      isolation checked afterwards
 *
 * It refuses to run against a non-local database unless SCALE_ALLOW=1, and
 * deletes the workspace it created at the end (SCALE_KEEP=1 keeps it).
 *
 *   npx tsx scripts/scale/validate.ts [--out results.json]
 *   SCALE_COMPANIES=100000 SCALE_SCREEN=20000 SCALE_TASKS=10000 SCALE_APPS=50 SCALE_RUNS=40 SCALE_WORKERS=4
 *
 * The numbers describe this run on this machine and database; they are
 * not a promise about another environment.
 */
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import { db } from '@/lib/db';
import { systemAccess } from '@/server/access/scope';
import { listAccounts, accountFilterSchema } from '@/server/services/accounts';
import { matchCompany } from '@/server/services/companies/dedup';
import { normalizeCompanyName } from '@/server/services/companies/normalize';
import { enqueueJobs } from '@/server/services/jobs';
import { processQueues, syntheticProbe } from '@/server/services/job-runner';
import { enqueuePendingScreening } from '@/server/services/pipeline/gates';
import { rescoreAccount } from '@/server/services/scoring';
import { funnelMetrics } from '@/server/services/pipeline/funnel';
import { clearQueueSettingsCache, setQueueOverride } from '@/server/queues/settings';
import type { QueueName } from '@/server/queues/registry';
import { createApplication, ensureBuiltinTemplates, startExecution } from '@/server/studio/applications';

const N = Number(process.env.SCALE_COMPANIES ?? 100_000);
const SCREEN = Math.min(N, Number(process.env.SCALE_SCREEN ?? 20_000));
const TASKS = Number(process.env.SCALE_TASKS ?? 10_000);
const APPS = Number(process.env.SCALE_APPS ?? 50);
const RUNS = Number(process.env.SCALE_RUNS ?? 40);
const WORKERS = Number(process.env.SCALE_WORKERS ?? 4);
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : null;

const INDUSTRIES = ['Manufacturing', 'Construction', 'Logistics', 'Professional services', 'Healthcare', 'Retail', 'Wholesale', 'Food processing'];
const CITIES = ['Toronto', 'Mississauga', 'Brampton', 'Hamilton', 'Markham', 'Vaughan', 'Oakville', 'Burlington', 'Oshawa', 'Kitchener'];

// Deterministic pseudo-random numbers, so runs are comparable.
let seed = 42;
const rand = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
const pad = (i: number) => String(i).padStart(7, '0');

const ms = (start: bigint) => Number(process.hrtime.bigint() - start) / 1e6;
function stats(samples: number[]) {
  const s = [...samples].sort((a, b) => a - b);
  const q = (p: number) => Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]! * 10) / 10;
  return { n: s.length, p50: q(0.5), p95: q(0.95), max: Math.round(s[s.length - 1]! * 10) / 10 };
}
async function time<T>(fn: () => Promise<T>) { const t = process.hrtime.bigint(); const r = await fn(); return { ms: ms(t), r }; }

async function drain(queues: QueueName[], label: string, until: () => Promise<boolean>, limitMs = 30 * 60_000) {
  const start = Date.now();
  await Promise.all(Array.from({ length: WORKERS }, async (_, w) => {
    while (Date.now() - start < limitMs) {
      const ran = await processQueues(`${label}-${w}`, queues, 8, { deadline: Date.now() + 60_000 });
      if (!ran && (await until())) return;
      if (!ran) await new Promise((r) => setTimeout(r, 100));
    }
  }));
  return Date.now() - start;
}

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) && process.env.SCALE_ALLOW !== '1') {
    throw new Error('Refusing to write synthetic load to a non-local database. Set SCALE_ALLOW=1 for a staging database you mean to use.');
  }
  const results: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    machine: { cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model, memoryGb: Math.round(os.totalmem() / 2 ** 30), node: process.version },
    database: url.replace(/:[^:@/]*@/, ':***@').replace(/\?.*/, ''),
    params: { companies: N, screened: SCREEN, tasks: TASKS, apps: APPS, runsPerApp: RUNS, workers: WORKERS },
  };
  const orgId = randomUUID();
  await db.organization.create({ data: { id: orgId, clerkOrgId: `scale_${orgId}`, name: 'Scale validation (synthetic)', slug: `scale-${orgId.slice(0, 8)}` } });
  const access = systemAccess(orgId);
  const client = await db.client.create({ data: { organizationId: orgId, name: 'Synthetic scale prospects', slug: `synthetic-scale-${orgId.slice(0, 6)}` } });

  try {
    // 1. Bulk load.
    const load = await time(async () => {
      for (let from = 0; from < N; from += 5_000) {
        await db.account.createMany({
          data: Array.from({ length: Math.min(5_000, N - from) }, (_, k) => {
            const i = from + k;
            const name = `Synthetic Company ${pad(i)}`;
            return {
              organizationId: orgId, clientId: client.id, name, normalizedName: normalizeCompanyName(name), domain: `synthetic-${pad(i)}.test`,
              websiteUrl: `https://synthetic-${pad(i)}.test`, industry: pick(INDUSTRIES), city: pick(CITIES), region: 'ON', country: 'CA',
              employeeCount: Math.floor(rand() * 400) + 2, phone: rand() > 0.4 ? `+1416555${String(i % 10_000).padStart(4, '0')}` : null,
            };
          }),
        });
      }
    });
    results.bulkLoad = { companies: N, seconds: +(load.ms / 1000).toFixed(1), perSecond: Math.round(N / (load.ms / 1000)) };
    console.log('bulk load', results.bulkLoad);

    // 2a. First-time scoring, which normal intake does when it creates a company (the bulk load skipped it).
    const scoring = await time(async () => {
      const ids = await db.account.findMany({ where: { organizationId: orgId }, select: { id: true }, orderBy: { id: 'asc' }, take: SCREEN });
      let next = 0;
      await Promise.all(Array.from({ length: WORKERS }, async () => {
        while (next < ids.length) { const id = ids[next++]!.id; await rescoreAccount(id); }
      }));
    });
    results.scoring = { accounts: SCREEN, workers: WORKERS, seconds: +(scoring.ms / 1000).toFixed(1), perSecond: Math.round(SCREEN / (scoring.ms / 1000)) };
    console.log('scoring', results.scoring);

    // 2b. Screening through the real queue and workers.
    await setQueueOverride('screening', { paused: false }, null);
    await db.account.updateMany({ where: { organizationId: orgId, scoredAt: null }, data: { screenedAt: new Date(0) } }); // leave unscored ones out
    const queued = await enqueuePendingScreening(orgId, SCREEN);
    const screenMs = await drain(['screening'], 'scale-screen', async () => (await db.job.count({ where: { organizationId: orgId, queue: 'screening', status: { in: ['QUEUED', 'RETRYING', 'RUNNING'] } } })) === 0);
    const screened = await db.account.count({ where: { organizationId: orgId, screenedAt: { gt: new Date(0) } } });
    const stages = await db.account.groupBy({ by: ['pipelineStage'], where: { organizationId: orgId }, _count: true });
    results.screening = { jobsQueued: queued, accountsScreened: screened, seconds: +(screenMs / 1000).toFixed(1), perSecond: Math.round(screened / (screenMs / 1000)), stages: Object.fromEntries(stages.map((s) => [s.pipelineStage, s._count])) };
    console.log('screening', results.screening);
    // Stop the funnel from spending anything: no analysis runs in this script.
    await db.job.deleteMany({ where: { organizationId: orgId, queue: { not: 'screening' } } });

    // 3. Read latency at this size.
    const reads: Record<string, ReturnType<typeof stats>> = {};
    const measure = async (name: string, fn: () => Promise<unknown>, n = 15) => {
      await fn(); // warm
      const samples: number[] = [];
      for (let k = 0; k < n; k++) samples.push((await time(fn)).ms);
      reads[name] = stats(samples);
    };
    await measure('funnelMetrics', () => funnelMetrics(access));
    await measure('explorer: top by score', () => listAccounts(access, accountFilterSchema.parse({ limit: 50 })));
    await measure('explorer: search by name', () => listAccounts(access, accountFilterSchema.parse({ search: `Company 00${Math.floor(rand() * 9)}`, limit: 50 })));
    await measure('explorer: industry + city filters', () => listAccounts(access, accountFilterSchema.parse({ industry: ['Manufacturing'], region: ['ON'], minScore: 10, limit: 50 })));
    results.readLatencyMs = reads;
    console.log('reads', reads);

    // 4. Dedup lookups against the full table (existing and new companies).
    const lookups: number[] = [];
    let matched = 0;
    for (let k = 0; k < 400; k++) {
      const existing = k % 2 === 0;
      const i = existing ? Math.floor(rand() * N) : N + k;
      const name = `Synthetic Company ${pad(i)}`;
      const t = process.hrtime.bigint();
      const decision = await db.$transaction((tx) => matchCompany(tx, client.id, {
        normalizedName: normalizeCompanyName(name), domain: existing && k % 4 === 0 ? `synthetic-${pad(i)}.test` : null,
        city: null, region: null, addressLine: null, phone: null, identifiers: [], contactEmails: [],
      }));
      lookups.push(ms(t));
      if (decision.action === 'match') matched++;
    }
    results.dedupLookupMs = { ...stats(lookups), matchedExisting: matched, ofExisting: 200 };
    console.log('dedup', results.dedupLookupMs);

    // 5. Queue throughput.
    await setQueueOverride('synthetic', { paused: false, concurrency: 16, perOrgConcurrency: null, maxPerMinute: null, timeoutMs: 30_000, maxAttempts: 3 }, null);
    syntheticProbe.active = 0; syntheticProbe.maxActive = 0; syntheticProbe.writes = 0;
    const enq = await time(() => enqueueJobs('SYNTHETIC_TASK', Array.from({ length: TASKS }, (_, i) => ({
      organizationId: orgId, clientId: client.id, idempotencyKey: `scale-${orgId}-${i}`, payload: { companyIndex: 1_000_000 + i } as never,
    }))));
    const queueMs = await drain(['synthetic'], 'scale-queue', async () => (await db.job.count({ where: { organizationId: orgId, queue: 'synthetic', status: { in: ['QUEUED', 'RETRYING', 'RUNNING'] } } })) === 0);
    const done = await db.job.groupBy({ by: ['status'], where: { organizationId: orgId, queue: 'synthetic' }, _count: true });
    results.queue = {
      tasks: TASKS, enqueueSeconds: +(enq.ms / 1000).toFixed(1), seconds: +(queueMs / 1000).toFixed(1), perSecond: Math.round(TASKS / (queueMs / 1000)),
      maxConcurrent: syntheticProbe.maxActive, concurrencyLimit: 16, byStatus: Object.fromEntries(done.map((d) => [d.status, d._count])),
      // Task companies are numbered from 1,000,000; the bulk-loaded ones are zero-padded below that.
      companiesWritten: await db.account.count({ where: { clientId: client.id, name: { startsWith: 'Synthetic Company 1' } } }),
    };
    console.log('queue', results.queue);

    // 6. Customer workflows across many applications.
    await ensureBuiltinTemplates();
    const tv = await db.appTemplateVersion.findFirstOrThrow({ where: { template: { slug: 'manufacturing-quality-claims', organizationId: null } } });
    const apps: Array<{ id: string; clientId: string }> = [];
    for (let a = 0; a < APPS; a++) {
      const c = await db.client.create({ data: { organizationId: orgId, name: `Synthetic customer ${a}`, slug: `synthetic-cust-${a}-${orgId.slice(0, 6)}` } });
      const { app, config } = await createApplication(access, null, { clientId: c.id, templateVersionId: tv.id, name: `Claims ${a}`, overrides: { rules: { escalation_quantity: 1_000_000 }, limits: { maxExecutionsPerDay: 10_000, maxConcurrent: 2 } } });
      // Load test only: activate directly instead of through the test gate (covered by the Studio tests).
      await db.clientApplication.update({ where: { id: app.id }, data: { status: 'ACTIVE', activeConfigVersionId: config.id } });
      apps.push({ id: app.id, clientId: c.id });
    }
    const start = await time(async () => {
      for (const app of apps) {
        for (let r = 0; r < RUNS; r++) {
          await startExecution(access, null, app.id, 'claim_intake', { customer: `Synthetic buyer ${r}`, part_number: `P-${r}`, defect: 'Synthetic defect', quantity: 1 + (r % 9), severity: 'low' });
        }
      }
    });
    const wfMs = await drain(['customer-workflows'], 'scale-studio', async () => (await db.workflowExecution.count({ where: { organizationId: orgId, status: { in: ['QUEUED', 'RUNNING'] } } })) === 0);
    const byStatus = await db.workflowExecution.groupBy({ by: ['status'], where: { organizationId: orgId }, _count: true });
    const perApp = await db.appRecord.groupBy({ by: ['applicationId', 'clientId'], where: { applicationId: { in: apps.map((a) => a.id) }, collection: 'claims' }, _count: true });
    const misplaced = perApp.filter((p) => apps.find((a) => a.id === p.applicationId)?.clientId !== p.clientId).length;
    const total = APPS * RUNS;
    results.customerWorkflows = {
      applications: APPS, runs: total, startSeconds: +(start.ms / 1000).toFixed(1), seconds: +(wfMs / 1000).toFixed(1), perSecond: Math.round(total / (wfMs / 1000)),
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      recordsPerApp: { min: Math.min(...perApp.map((p) => p._count)), max: Math.max(...perApp.map((p) => p._count)), expected: RUNS },
      recordsInAnotherCustomer: misplaced,
    };
    console.log('customer workflows', results.customerWorkflows);
  } finally {
    await db.queueSetting.deleteMany({ where: { queue: { in: ['synthetic', 'screening'] } } }).catch(() => undefined);
    clearQueueSettingsCache();
    if (process.env.SCALE_KEEP !== '1') {
      const cleanup = await time(async () => {
        await db.job.deleteMany({ where: { organizationId: orgId } });
        await db.organization.delete({ where: { id: orgId } });
      });
      results.cleanupSeconds = +(cleanup.ms / 1000).toFixed(1);
    }
    results.finishedAt = new Date().toISOString();
    if (out) writeFileSync(out, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
    await db.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
