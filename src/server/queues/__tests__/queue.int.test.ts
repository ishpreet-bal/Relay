import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Phase B acceptance: the queue under load and under failure, against a real
 * migrated Postgres. Skipped when no database is reachable.
 *
 * The 1,000-task run injects: failures before the write (retried), failures
 * after the write (retried; must not duplicate), attempts that exceed the
 * queue timeout (and still finish in the background), permanent failures
 * (dead letters), a worker that claims a batch and dies, duplicate
 * enqueues, and tasks that share a company (must produce one record).
 */

const { dbTestsAllowed } = await import('@/test/db');
const { db } = await import('@/lib/db');
const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);

const { enqueueJobs, claimFromQueue, releaseStaleJobs } = await import('@/server/services/jobs');
const { processQueues, syntheticProbe } = await import('@/server/services/job-runner');
const { setQueueOverride, clearQueueSettingsCache } = await import('../settings');
const { setProviderThrottle } = await import('../throttle');

const TOTAL = 1000;
const CONCURRENCY = 8;

interface Payload { companyIndex: number; failBeforeWriteAttempts?: number; failAfterWriteOnce?: boolean; hangFirstAttemptMs?: number; permanent?: boolean; provider?: string; providerFails?: boolean; workMs?: number }

function payloadFor(i: number): Payload {
  return {
    // Tasks i and i + 900 write the same company.
    companyIndex: i % 900,
    ...(i % 10 === 3 ? { failBeforeWriteAttempts: 1 } : {}),
    ...(i % 25 === 7 ? { failAfterWriteOnce: true } : {}),
    ...(i % 200 === 11 ? { hangFirstAttemptMs: 2_500 } : {}),
    ...(i % 250 === 13 ? { permanent: true } : {}),
  };
}

async function drain(queues: Array<'synthetic'>, workers: number, perWorker: number, limitMs: number) {
  const until = Date.now() + limitMs;
  const loop = async (w: number) => {
    while (Date.now() < until) {
      const ran = await processQueues(`load-worker-${w}`, queues, perWorker, { deadline: Date.now() + 60_000 });
      if (ran) continue;
      const pending = await db.job.count({ where: { queue: 'synthetic', status: { in: ['QUEUED', 'RETRYING', 'RUNNING'] } } });
      if (!pending) return;
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  await Promise.all(Array.from({ length: workers }, (_, w) => loop(w)));
}

async function makeTenant(label: string) {
  const orgId = randomUUID();
  await db.organization.create({ data: { id: orgId, clerkOrgId: `test_${orgId}`, name: `Queue test ${label}`, slug: `queue-test-${orgId.slice(0, 8)}` } });
  const client = await db.client.create({ data: { organizationId: orgId, name: `Synthetic ${label}`, slug: `synthetic-${label}` } });
  return { orgId, clientId: client.id };
}

describe.skipIf(!reachable)('queue (database)', () => {
  const orgs: string[] = [];

  beforeAll(async () => {
    await db.job.deleteMany({ where: { queue: 'synthetic' } });
    await setQueueOverride('synthetic', { paused: false, concurrency: CONCURRENCY, perOrgConcurrency: null, maxPerMinute: null, retryBaseMs: 50, timeoutMs: 2_000, maxAttempts: 3 }, null);
  });

  beforeEach(async () => {
    syntheticProbe.active = 0; syntheticProbe.maxActive = 0; syntheticProbe.writes = 0;
    await db.job.deleteMany({ where: { queue: 'synthetic' } });
    await setQueueOverride('synthetic', { paused: false, concurrency: CONCURRENCY, perOrgConcurrency: null, maxPerMinute: null, retryBaseMs: 50, timeoutMs: 2_000, maxAttempts: 3 }, null);
  });

  afterAll(async () => {
    if (!reachable) return;
    await db.job.deleteMany({ where: { queue: 'synthetic' } });
    for (const id of orgs) await db.organization.delete({ where: { id } }).catch(() => undefined);
    await db.queueSetting.deleteMany({ where: { queue: 'synthetic' } });
    await db.providerThrottle.deleteMany({ where: { provider: { startsWith: 'synthetic-' } } });
    clearQueueSettingsCache();
    await db.$disconnect();
  });

  it(`processes ${TOTAL} tasks within limits, recovers from injected failures and creates no duplicates`, async () => {
    const t = await makeTenant(`load-${randomUUID().slice(0, 6)}`);
    orgs.push(t.orgId);
    const jobs = Array.from({ length: TOTAL }, (_, i) => ({
      organizationId: t.orgId, clientId: t.clientId, idempotencyKey: `load-${t.clientId}-${i}`,
      payload: payloadFor(i) as unknown as import('@prisma/client').Prisma.InputJsonValue,
    }));

    // Enqueueing twice must not double the work.
    expect(await enqueueJobs('SYNTHETIC_TASK', jobs)).toBe(TOTAL);
    expect(await enqueueJobs('SYNTHETIC_TASK', jobs)).toBe(0);
    expect(await db.job.count({ where: { queue: 'synthetic', organizationId: t.orgId } })).toBe(TOTAL);

    // A worker claims a full batch, then dies without finishing.
    const crashed = await claimFromQueue('synthetic', 'crashed-worker', 50);
    expect(crashed).toHaveLength(CONCURRENCY);
    // Concurrency is strict: with every slot held, nobody else gets a job.
    expect(await claimFromQueue('synthetic', 'other-worker', 5)).toHaveLength(0);
    await releaseStaleJobs(0);

    const started = Date.now();
    await drain(['synthetic'], 4, 4, 120_000);
    const elapsedMs = Date.now() - started;
    // Let any attempt that outlived its timeout finish its (idempotent) write.
    await new Promise((r) => setTimeout(r, 3_000));

    const byStatus = await db.job.groupBy({ by: ['status'], where: { queue: 'synthetic', organizationId: t.orgId }, _count: true });
    const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
    const permanent = Array.from({ length: TOTAL }, (_, i) => i).filter((i) => payloadFor(i).permanent);
    expect(count('COMPLETED')).toBe(TOTAL - permanent.length);
    expect(count('FAILED')).toBe(permanent.length);
    expect(count('RUNNING') + count('QUEUED') + count('RETRYING')).toBe(0);

    // Dead letters: attempts used up, kind recorded.
    const dead = await db.job.findMany({ where: { queue: 'synthetic', organizationId: t.orgId, status: 'FAILED' } });
    expect(dead.every((j) => j.deadLetteredAt && j.failureKind === 'EXHAUSTED' && j.attempts === 3)).toBe(true);

    // One account per company, however many tasks wrote it or how often they retried.
    const written = new Set(Array.from({ length: TOTAL }, (_, i) => i).filter((i) => !payloadFor(i).permanent).map((i) => payloadFor(i).companyIndex));
    const accounts = await db.account.count({ where: { clientId: t.clientId, deletedAt: null } });
    expect(accounts).toBe(written.size);
    const identifiers = await db.discoveryIdentifier.groupBy({ by: ['externalId'], where: { clientId: t.clientId, provider: 'synthetic' }, _count: true });
    expect(identifiers).toHaveLength(written.size);
    expect(identifiers.every((g) => g._count === 1)).toBe(true);
    expect(syntheticProbe.writes).toBeGreaterThan(written.size); // retries and timeouts really did write again

    // Never more than the queue's concurrency at once (the crashed batch never ran its handler).
    expect(syntheticProbe.maxActive).toBeLessThanOrEqual(CONCURRENCY);

    // Attempt history tells the story.
    const attempts = await db.jobAttempt.groupBy({ by: ['outcome'], where: { job: { organizationId: t.orgId, queue: 'synthetic' } }, _count: true });
    const outcome = (o: string) => attempts.find((a) => a.outcome === o)?._count ?? 0;
    expect(outcome('ABANDONED')).toBe(CONCURRENCY);
    expect(outcome('SUCCEEDED')).toBe(TOTAL - permanent.length);
    expect(outcome('TIMED_OUT')).toBeGreaterThanOrEqual(1);
    expect(outcome('FAILED')).toBeGreaterThanOrEqual(100 + 40);
    expect(await db.jobAttempt.count({ where: { finishedAt: null, job: { organizationId: t.orgId } } })).toBe(0);

    console.info(`[queue load] ${TOTAL} tasks in ${(elapsedMs / 1000).toFixed(1)}s (${(TOTAL / (elapsedMs / 1000)).toFixed(0)}/s), max ${syntheticProbe.maxActive} concurrent, ${syntheticProbe.writes} writes for ${written.size} companies`);
  }, 180_000);

  it('gives each organization at most its share of a queue', async () => {
    const a = await makeTenant(`share-a-${randomUUID().slice(0, 6)}`);
    const b = await makeTenant(`share-b-${randomUUID().slice(0, 6)}`);
    orgs.push(a.orgId, b.orgId);
    await setQueueOverride('synthetic', { perOrgConcurrency: 2 }, null);
    for (const t of [a, b]) {
      await enqueueJobs('SYNTHETIC_TASK', Array.from({ length: 10 }, (_, i) => ({ organizationId: t.orgId, clientId: t.clientId, payload: { companyIndex: i } })));
    }
    const claimed = await claimFromQueue('synthetic', 'share-worker', 8);
    const perOrg = new Map<string, number>();
    for (const j of claimed) perOrg.set(j.organizationId!, (perOrg.get(j.organizationId!) ?? 0) + 1);
    expect(claimed).toHaveLength(4);
    expect([...perOrg.values()].every((n) => n === 2)).toBe(true);
  });

  it('claims nothing from a paused queue, and enforces its per-minute rate', async () => {
    const t = await makeTenant(`pause-${randomUUID().slice(0, 6)}`);
    orgs.push(t.orgId);
    await enqueueJobs('SYNTHETIC_TASK', Array.from({ length: 20 }, (_, i) => ({ organizationId: t.orgId, clientId: t.clientId, payload: { companyIndex: i } })));
    await setQueueOverride('synthetic', { paused: true, pausedReason: 'test' }, null);
    expect(await claimFromQueue('synthetic', 'w', 8)).toHaveLength(0);
    await setQueueOverride('synthetic', { paused: false, maxPerMinute: 5 }, null);
    await drain(['synthetic'], 2, 4, 3_000);
    expect(await db.job.count({ where: { organizationId: t.orgId, status: 'COMPLETED' } })).toBe(5);
  });

  it('defers jobs past a provider budget without using their attempts', async () => {
    const t = await makeTenant(`budget-${randomUUID().slice(0, 6)}`);
    orgs.push(t.orgId);
    await setProviderThrottle('synthetic-api', { maxPerMinute: 6, reset: true });
    await db.providerThrottle.update({ where: { provider: 'synthetic-api' }, data: { windowCount: 0, windowStart: new Date() } });
    await enqueueJobs('SYNTHETIC_TASK', Array.from({ length: 10 }, (_, i) => ({
      organizationId: t.orgId, clientId: t.clientId, provider: 'synthetic-api', payload: { companyIndex: 100 + i, provider: 'synthetic-api' },
    })));
    await drain(['synthetic'], 2, 4, 3_000);
    expect(await db.job.count({ where: { organizationId: t.orgId, status: 'COMPLETED' } })).toBe(6);
    const deferred = await db.job.findMany({ where: { organizationId: t.orgId, status: 'QUEUED' } });
    expect(deferred).toHaveLength(4);
    expect(deferred.every((j) => j.attempts === 0 && j.runAt > new Date() && /request budget/.test(j.waitingReason ?? ''))).toBe(true);
  });

  it('opens a breaker for a failing provider, keeps other work flowing, and closes after a good trial', async () => {
    const t = await makeTenant(`breaker-${randomUUID().slice(0, 6)}`);
    orgs.push(t.orgId);
    await setProviderThrottle('synthetic-flaky', { maxPerMinute: null, failureThreshold: 3, reset: true });
    await enqueueJobs('SYNTHETIC_TASK', Array.from({ length: 8 }, (_, i) => ({
      organizationId: t.orgId, clientId: t.clientId, provider: 'synthetic-flaky', payload: { companyIndex: 200 + i, provider: 'synthetic-flaky', providerFails: true },
    })));
    await enqueueJobs('SYNTHETIC_TASK', Array.from({ length: 8 }, (_, i) => ({ organizationId: t.orgId, clientId: t.clientId, payload: { companyIndex: 300 + i } })));
    await setQueueOverride('synthetic', { maxAttempts: 10 }, null);
    await db.job.updateMany({ where: { organizationId: t.orgId }, data: { maxAttempts: 10 } });

    await drain(['synthetic'], 2, 2, 2_000);
    const breaker = await db.providerThrottle.findUniqueOrThrow({ where: { provider: 'synthetic-flaky' } });
    expect(breaker.consecutiveFailures).toBeGreaterThanOrEqual(3);
    expect(breaker.circuitOpenUntil!.getTime()).toBeGreaterThan(Date.now());
    // Work that doesn't need the provider is unaffected.
    expect(await db.job.count({ where: { organizationId: t.orgId, provider: null, status: 'COMPLETED' } })).toBe(8);
    // Jobs that need it wait, marked with why.
    const waiting = await db.job.findMany({ where: { organizationId: t.orgId, provider: 'synthetic-flaky', status: { in: ['QUEUED', 'RETRYING'] } } });
    expect(waiting.length).toBeGreaterThan(0);
    expect(waiting.some((j) => /paused until/.test(j.waitingReason ?? ''))).toBe(true);

    // Cooldown passes and the provider recovers: the trial succeeds and the breaker closes.
    await db.providerThrottle.update({ where: { provider: 'synthetic-flaky' }, data: { circuitOpenUntil: new Date(Date.now() - 1000) } });
    for (const j of waiting) {
      await db.job.update({ where: { id: j.id }, data: { runAt: new Date(), payload: { ...(j.payload as object), providerFails: false } } });
    }
    await drain(['synthetic'], 2, 2, 5_000);
    const closed = await db.providerThrottle.findUniqueOrThrow({ where: { provider: 'synthetic-flaky' } });
    expect(closed).toMatchObject({ consecutiveFailures: 0, circuitOpenUntil: null });
    expect(await db.job.count({ where: { organizationId: t.orgId, status: 'COMPLETED' } })).toBe(16);
  });
});
