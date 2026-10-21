import { Prisma, type Job, type JobStatus, type JobType } from '@prisma/client';
import { db } from '@/lib/db';
import { NotFoundError } from '@/server/errors';
import { JOB_TYPE_QUEUE, type QueueName } from '@/server/queues/registry';
import { queueRuntime, type QueueRuntime } from '@/server/queues/settings';
import { unavailableProviders } from '@/server/queues/throttle';

/**
 * Background jobs on Postgres. Each job belongs to a logical queue with its
 * own concurrency, rate limit, timeout, retry policy and pause switch
 * (server/queues). A job survives restarts, is visible with every attempt
 * and its error, and is claimed under a per-queue lock so limits hold across
 * any number of worker processes.
 *
 * Delivery is at least once: a worker can die after doing the work and
 * before recording it, and the job runs again. Handlers therefore make their
 * effects idempotent (unique constraints, upserts, idempotency keys); the
 * queue never claims exactly-once.
 */

export interface EnqueueParams {
  type: JobType;
  organizationId?: string | null;
  clientId?: string | null;
  payload?: Prisma.InputJsonValue;
  entityType?: string;
  entityId?: string;
  runAt?: Date;
  maxAttempts?: number;
  priority?: number;
  /** External provider the job depends on, for throttling. */
  provider?: string | null;
  /** Skip if the same work is already queued or running. */
  dedupeKey?: string;
  /** Unique within the queue for the job's lifetime; enqueueing it again returns the existing job. */
  idempotencyKey?: string;
  createdById?: string | null;
}

export async function enqueueJob(params: EnqueueParams): Promise<Job | null> {
  const queue = JOB_TYPE_QUEUE[params.type];
  if (params.dedupeKey) {
    const pending = await db.job.findFirst({
      where: { dedupeKey: params.dedupeKey, status: { in: ['QUEUED', 'RUNNING', 'RETRYING'] } },
    });
    if (pending) return null;
  }
  const runtime = await queueRuntime(queue);
  const data: Prisma.JobUncheckedCreateInput = {
    type: params.type,
    queue,
    organizationId: params.organizationId ?? null,
    clientId: params.clientId ?? null,
    payload: params.payload,
    entityType: params.entityType ?? null,
    entityId: params.entityId ?? null,
    runAt: params.runAt ?? new Date(),
    maxAttempts: params.maxAttempts ?? runtime.maxAttempts,
    priority: params.priority ?? 0,
    provider: params.provider ?? null,
    dedupeKey: params.dedupeKey ?? null,
    idempotencyKey: params.idempotencyKey ?? null,
    createdById: params.createdById ?? null,
  };
  if (!params.idempotencyKey) return db.job.create({ data });
  try {
    return await db.job.create({ data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return db.job.findUnique({ where: { queue_idempotencyKey: { queue, idempotencyKey: params.idempotencyKey } } });
    }
    throw err;
  }
}

/** Many jobs at once (e.g. a batch of screening tasks), skipping idempotency keys already used. */
export async function enqueueJobs(type: JobType, jobs: Array<Omit<EnqueueParams, 'type' | 'dedupeKey'>>) {
  if (!jobs.length) return 0;
  const queue = JOB_TYPE_QUEUE[type];
  const runtime = await queueRuntime(queue);
  const result = await db.job.createMany({
    data: jobs.map((p) => ({
      type, queue,
      organizationId: p.organizationId ?? null, clientId: p.clientId ?? null, payload: p.payload,
      entityType: p.entityType ?? null, entityId: p.entityId ?? null, runAt: p.runAt ?? new Date(),
      maxAttempts: p.maxAttempts ?? runtime.maxAttempts, priority: p.priority ?? 0, provider: p.provider ?? null,
      idempotencyKey: p.idempotencyKey ?? null, createdById: p.createdById ?? null,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

// ---------------------------------------------------------------------------
// Claiming
// ---------------------------------------------------------------------------

const lockQueue = (tx: Prisma.TransactionClient, queue: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('relay:queue'), hashtext(${queue}))`;

/**
 * Free slots under the queue's concurrency and per-minute limits. Running
 * means running jobs plus attempts that timed out but whose work has not
 * settled yet: Node can't cancel a promise, so that work still uses capacity.
 */
async function freeSlots(tx: Prisma.TransactionClient, q: QueueRuntime) {
  const runningRows = await tx.$queryRaw<Array<{ running: number }>>`
    SELECT (
      (SELECT count(*) FROM "Job" WHERE "queue" = ${q.name} AND "status" = 'RUNNING')
      + (SELECT count(*) FROM "JobAttempt" a JOIN "Job" j ON j."id" = a."jobId"
         WHERE j."queue" = ${q.name} AND a."finishedAt" IS NULL AND j."status" <> 'RUNNING')
    )::int AS running`;
  let slots = q.concurrency - (runningRows[0]?.running ?? 0);
  if (q.maxPerMinute !== null && slots > 0) {
    const startedRows = await tx.$queryRaw<Array<{ started: number }>>`
      SELECT count(*)::int AS started FROM "JobAttempt" a JOIN "Job" j ON j."id" = a."jobId"
      WHERE j."queue" = ${q.name} AND a."startedAt" > NOW() - INTERVAL '1 minute'`;
    slots = Math.min(slots, q.maxPerMinute - (startedRows[0]?.started ?? 0));
  }
  return Math.max(0, slots);
}

/**
 * Claims up to `max` runnable jobs from one queue, honouring its pause
 * switch, concurrency, per-minute rate, per-organization share and any
 * provider whose breaker is open. Serialized per queue by an advisory lock,
 * so two workers can't both see a free slot and take it.
 */
export async function claimFromQueue(queue: QueueName, workerId: string, max: number): Promise<Job[]> {
  const q = await queueRuntime(queue);
  if (q.paused || max <= 0) return [];
  const blocked = await unavailableProviders();

  const ids = await db.$transaction(async (tx) => {
    await lockQueue(tx, queue);
    const slots = Math.min(max, await freeSlots(tx, q));
    if (!slots) return [];
    const notBlocked = blocked.length ? Prisma.sql`AND ("provider" IS NULL OR "provider" NOT IN (${Prisma.join(blocked)}))` : Prisma.empty;
    const cap = q.perOrgConcurrency;
    const candidates = await tx.$queryRaw<Array<{ id: string }>>`
      WITH running AS (
        SELECT "organizationId", count(*)::int AS n FROM "Job"
        WHERE "queue" = ${queue} AND "status" = 'RUNNING' AND "organizationId" IS NOT NULL GROUP BY 1
      ), ranked AS (
        SELECT j."id", j."priority", j."runAt", j."organizationId",
               row_number() OVER (PARTITION BY j."organizationId" ORDER BY j."priority" DESC, j."runAt" ASC) AS rn,
               COALESCE(r.n, 0) AS n
        FROM "Job" j LEFT JOIN running r ON r."organizationId" = j."organizationId"
        WHERE j."queue" = ${queue} AND j."status" IN ('QUEUED', 'RETRYING') AND j."runAt" <= NOW() ${notBlocked}
        ORDER BY j."priority" DESC, j."runAt" ASC
        LIMIT ${slots * 20 + 50}
      )
      SELECT "id" FROM ranked
      WHERE ${cap}::int IS NULL OR "organizationId" IS NULL OR rn + n <= ${cap}::int
      ORDER BY "priority" DESC, "runAt" ASC
      LIMIT ${slots}`;
    if (!candidates.length) return [];
    // Re-checking status makes a concurrent claim by id (runJobNow) safe.
    const claimed = await tx.$queryRaw<Array<{ id: string; attempts: number }>>`
      UPDATE "Job"
      SET "status" = 'RUNNING', "lockedAt" = NOW(), "lockedBy" = ${workerId}, "startedAt" = NOW(),
          "attempts" = "attempts" + 1, "waitingReason" = NULL, "updatedAt" = NOW()
      WHERE "id" IN (${Prisma.join(candidates.map((c) => Prisma.sql`${c.id}::uuid`))}) AND "status" IN ('QUEUED', 'RETRYING')
      RETURNING "id", "attempts"`;
    if (claimed.length) {
      await tx.jobAttempt.createMany({ data: claimed.map((c) => ({ jobId: c.id, attempt: c.attempts, workerId })) });
    }
    return claimed.map((c) => c.id);
  });
  if (!ids.length) return [];
  return db.job.findMany({ where: { id: { in: ids } } });
}

/** @deprecated kept for callers that don't name a queue; claims across the given queues in order. */
export async function claimJobs(workerId: string, limit: number, queues: QueueName[]): Promise<Job[]> {
  const out: Job[] = [];
  for (const queue of queues) {
    if (out.length >= limit) break;
    out.push(...await claimFromQueue(queue, workerId, limit - out.length));
  }
  return out;
}

/**
 * Claims one specific job now (a page moving a discovery run forward),
 * within its queue's limits, also taking it over when its holder has gone
 * quiet for `staleAfterMs`.
 */
export async function claimJob(id: string, workerId: string, staleAfterMs: number): Promise<Job | null> {
  const job = await db.job.findUnique({ where: { id }, select: { queue: true } });
  if (!job) return null;
  const q = await queueRuntime(job.queue as QueueName).catch(() => null);
  if (q?.paused) return null;
  const staleBefore = new Date(Date.now() - staleAfterMs);
  const claimed = await db.$transaction(async (tx) => {
    await lockQueue(tx, job.queue);
    const takeover = await tx.job.count({ where: { id, status: 'RUNNING', lockedAt: { lt: staleBefore } } });
    if (!takeover && q && !(await freeSlots(tx, q))) return null;
    const rows = await tx.$queryRaw<Array<{ id: string; attempts: number }>>`
      UPDATE "Job"
      SET "status" = 'RUNNING', "lockedAt" = NOW(), "lockedBy" = ${workerId}, "startedAt" = NOW(),
          "attempts" = "attempts" + 1, "waitingReason" = NULL, "updatedAt" = NOW()
      WHERE "id" = ${id}::uuid
        AND ("status" IN ('QUEUED', 'RETRYING') OR ("status" = 'RUNNING' AND "lockedAt" < ${staleBefore}))
      RETURNING "id", "attempts"`;
    if (!rows[0]) return null;
    if (takeover) await closeOpenAttempts(tx, id, 'ABANDONED', 'Taken over after the previous holder went quiet');
    await tx.jobAttempt.create({ data: { jobId: id, attempt: rows[0].attempts, workerId } });
    return rows[0].id;
  });
  return claimed ? db.job.findUnique({ where: { id: claimed } }) : null;
}

// ---------------------------------------------------------------------------
// Finishing
// ---------------------------------------------------------------------------

async function closeOpenAttempts(tx: Prisma.TransactionClient, jobId: string, outcome: string, error: string | null = null, attempt?: number) {
  const which = attempt === undefined ? Prisma.empty : Prisma.sql`AND "attempt" = ${attempt}`;
  await tx.$executeRaw`
    UPDATE "JobAttempt" SET "finishedAt" = NOW(), "outcome" = ${outcome}, "error" = ${error},
      "durationMs" = (EXTRACT(EPOCH FROM (NOW() - "startedAt")) * 1000)::int
    WHERE "jobId" = ${jobId}::uuid AND "finishedAt" IS NULL ${which}`;
}

/**
 * Records that the work of a timed-out attempt has finally stopped, freeing
 * the capacity it was still using.
 */
export async function settleTimedOutAttempt(jobId: string, attempt: number) {
  await db.$executeRaw`
    UPDATE "JobAttempt" SET "finishedAt" = NOW(), "durationMs" = (EXTRACT(EPOCH FROM (NOW() - "startedAt")) * 1000)::int
    WHERE "jobId" = ${jobId}::uuid AND "attempt" = ${attempt} AND "finishedAt" IS NULL`;
}

const elapsed = (job: Pick<Job, 'startedAt'>) => (job.startedAt ? Date.now() - job.startedAt.getTime() : null);

export async function completeJob(id: string, result?: Prisma.InputJsonValue) {
  return db.$transaction(async (tx) => {
    const job = await tx.job.findUniqueOrThrow({ where: { id }, select: { startedAt: true, attempts: true } });
    await closeOpenAttempts(tx, id, 'SUCCEEDED', null, job.attempts);
    return tx.job.update({
      where: { id },
      data: { status: 'COMPLETED', result, error: null, finishedAt: new Date(), lockedAt: null, lockedBy: null, durationMs: elapsed(job) },
    });
  });
}

/**
 * Puts a job that made progress but isn't finished back in the queue. The
 * attempt is not counted: only failures use up attempts.
 */
export async function requeueJob(id: string, runAt = new Date(), waitingReason: string | null = null) {
  return db.$transaction(async (tx) => {
    const job = await tx.job.findUniqueOrThrow({ where: { id }, select: { attempts: true } });
    await closeOpenAttempts(tx, id, 'CONTINUED', waitingReason, job.attempts);
    return tx.job.update({
      where: { id },
      data: { status: 'QUEUED', runAt, lockedAt: null, lockedBy: null, attempts: { decrement: 1 }, error: null, waitingReason },
    });
  });
}

export type FailureKind = 'EXHAUSTED' | 'NOT_RETRYABLE' | 'TIMEOUT';

/**
 * Retries with exponential backoff from the queue's base delay (base, 4×,
 * 16×…, with jitter) until attempts run out; then the job is a dead letter:
 * FAILED with `deadLetteredAt` set, kept for inspection and manual retry.
 */
export async function failJob(job: Job, error: unknown, opts: { retryable?: boolean; timedOut?: boolean } = {}) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
  const retry = opts.retryable !== false && job.attempts < job.maxAttempts;
  const q = await queueRuntime(job.queue as QueueName).catch(() => null);
  const base = q?.retryBaseMs ?? 60_000;
  const delay = base * 4 ** Math.max(0, job.attempts - 1) * (0.8 + Math.random() * 0.4);
  const kind: FailureKind = opts.timedOut ? 'TIMEOUT' : opts.retryable === false ? 'NOT_RETRYABLE' : 'EXHAUSTED';
  return db.$transaction(async (tx) => {
    if (opts.timedOut) {
      // Left open until the work settles (settleTimedOutAttempt), so it keeps counting against concurrency.
      await tx.jobAttempt.updateMany({ where: { jobId: job.id, attempt: job.attempts, finishedAt: null }, data: { outcome: 'TIMED_OUT', error: message } });
    } else {
      await closeOpenAttempts(tx, job.id, 'FAILED', message, job.attempts);
    }
    return tx.job.update({
      where: { id: job.id },
      data: retry
        ? { status: 'RETRYING', error: message, runAt: new Date(Date.now() + delay), lockedAt: null, lockedBy: null }
        : { status: 'FAILED', error: message, finishedAt: new Date(), lockedAt: null, lockedBy: null, deadLetteredAt: new Date(), failureKind: kind, durationMs: elapsed(job) },
    });
  });
}

/**
 * Releases jobs whose worker died mid-run (no completion within
 * `olderThanMs` of the claim), so they are picked up again. Their open
 * attempts are recorded as abandoned.
 */
export async function releaseStaleJobs(olderThanMs = 30 * 60_000) {
  const cutoff = new Date(Date.now() - olderThanMs);
  return db.$transaction(async (tx) => {
    const stale = await tx.job.findMany({ where: { status: 'RUNNING', lockedAt: { lt: cutoff } }, select: { id: true } });
    for (const s of stale) await closeOpenAttempts(tx, s.id, 'ABANDONED', 'Worker stopped before finishing');
    // Timed-out work whose worker died before it settled.
    await tx.jobAttempt.updateMany({
      where: { finishedAt: null, startedAt: { lt: cutoff }, job: { status: { not: 'RUNNING' } } },
      data: { finishedAt: new Date(), error: 'Worker stopped before the timed-out work settled' },
    });
    const released = await tx.job.updateMany({
      where: { id: { in: stale.map((s) => s.id) }, status: 'RUNNING' },
      data: { status: 'RETRYING', lockedAt: null, lockedBy: null, error: 'Worker stopped before finishing; retrying' },
    });
    return released;
  });
}

// ---------------------------------------------------------------------------
// Inspection and manual control
// ---------------------------------------------------------------------------

export async function listJobs(organizationId: string, params: { status?: JobStatus[]; type?: JobType; queue?: string; deadLetter?: boolean; limit?: number }) {
  return db.job.findMany({
    where: {
      organizationId,
      ...(params.status?.length ? { status: { in: params.status } } : {}),
      ...(params.type ? { type: params.type } : {}),
      ...(params.queue ? { queue: params.queue } : {}),
      ...(params.deadLetter ? { deadLetteredAt: { not: null }, status: 'FAILED' } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: params.limit ?? 100,
  });
}

export async function getJob(organizationId: string, id: string) {
  const job = await db.job.findFirst({
    where: { id, organizationId },
    include: { attemptLog: { orderBy: { attempt: 'asc' } } },
  });
  if (!job) throw new NotFoundError('Job');
  const usage = await db.usageRecord.aggregate({ where: { jobId: id }, _sum: { costMillicents: true, actualCostMillicents: true }, _count: true });
  return { ...job, usage: { records: usage._count, costMillicents: usage._sum.costMillicents ?? 0, actualCostMillicents: usage._sum.actualCostMillicents } };
}

export async function jobSummary(organizationId: string) {
  const since = new Date(Date.now() - 24 * 3600_000);
  const [byStatus, failedRecently, research] = await Promise.all([
    db.job.groupBy({ by: ['status'], where: { organizationId }, _count: true }),
    db.job.count({ where: { organizationId, status: 'FAILED', updatedAt: { gte: since } } }),
    db.research.groupBy({ by: ['status'], where: { organizationId }, _count: true }),
  ]);
  return {
    jobs: byStatus.map((s) => ({ status: s.status, count: s._count })),
    failedLast24h: failedRecently,
    research: research.map((r) => ({ status: r.status, count: r._count })),
  };
}

export interface QueueStats {
  queue: string;
  queued: number; running: number; retrying: number; failed: number; deadLetters: number; waiting: number;
  completed24h: number; oldestPendingAt: Date | null;
  attempts24h: number; failures24h: number; avgDurationMs: number | null;
  costMillicents24h: number; estimatedCost: boolean;
}

/** Depth, age, speed, error rate and cost per queue, for one organization. */
export async function queueStats(organizationId: string): Promise<QueueStats[]> {
  const [depth, attempts, cost] = await Promise.all([
    db.$queryRaw<Array<{ queue: string; queued: number; running: number; retrying: number; failed: number; dead: number; waiting: number; completed24h: number; oldest: Date | null }>>`
      SELECT "queue",
        count(*) FILTER (WHERE "status" = 'QUEUED')::int AS queued,
        count(*) FILTER (WHERE "status" = 'RUNNING')::int AS running,
        count(*) FILTER (WHERE "status" = 'RETRYING')::int AS retrying,
        count(*) FILTER (WHERE "status" = 'FAILED')::int AS failed,
        count(*) FILTER (WHERE "status" = 'FAILED' AND "deadLetteredAt" IS NOT NULL)::int AS dead,
        count(*) FILTER (WHERE "status" IN ('QUEUED', 'RETRYING') AND "waitingReason" IS NOT NULL)::int AS waiting,
        count(*) FILTER (WHERE "status" = 'COMPLETED' AND "finishedAt" > NOW() - INTERVAL '24 hours')::int AS "completed24h",
        min("createdAt") FILTER (WHERE "status" IN ('QUEUED', 'RETRYING')) AS oldest
      FROM "Job" WHERE "organizationId" = ${organizationId}::uuid GROUP BY "queue"`,
    db.$queryRaw<Array<{ queue: string; attempts: number; failures: number; avg: number | null }>>`
      SELECT j."queue", count(*)::int AS attempts,
        count(*) FILTER (WHERE a."outcome" IN ('FAILED', 'TIMED_OUT', 'ABANDONED'))::int AS failures,
        avg(a."durationMs") FILTER (WHERE a."outcome" = 'SUCCEEDED')::float AS avg
      FROM "JobAttempt" a JOIN "Job" j ON j."id" = a."jobId"
      WHERE j."organizationId" = ${organizationId}::uuid AND a."startedAt" > NOW() - INTERVAL '24 hours'
      GROUP BY j."queue"`,
    db.$queryRaw<Array<{ queue: string; cost: number; estimate: boolean }>>`
      SELECT j."queue", COALESCE(sum(u."costMillicents"), 0)::int AS cost, bool_or(u."isEstimate") AS estimate
      FROM "UsageRecord" u JOIN "Job" j ON j."id" = u."jobId"
      WHERE u."organizationId" = ${organizationId}::uuid AND u."occurredAt" > NOW() - INTERVAL '24 hours'
      GROUP BY j."queue"`,
  ]);
  const names = new Set([...depth.map((d) => d.queue), ...attempts.map((a) => a.queue)]);
  return [...names].map((queue) => {
    const d = depth.find((x) => x.queue === queue);
    const a = attempts.find((x) => x.queue === queue);
    const c = cost.find((x) => x.queue === queue);
    return {
      queue,
      queued: d?.queued ?? 0, running: d?.running ?? 0, retrying: d?.retrying ?? 0, failed: d?.failed ?? 0,
      deadLetters: d?.dead ?? 0, waiting: d?.waiting ?? 0, completed24h: d?.completed24h ?? 0, oldestPendingAt: d?.oldest ?? null,
      attempts24h: a?.attempts ?? 0, failures24h: a?.failures ?? 0, avgDurationMs: a?.avg ?? null,
      costMillicents24h: c?.cost ?? 0, estimatedCost: c?.estimate ?? false,
    };
  });
}

export async function retryJob(organizationId: string, id: string) {
  const job = await db.job.findFirst({ where: { id, organizationId, status: { in: ['FAILED', 'CANCELLED'] } } });
  if (!job) throw new NotFoundError('Job');
  return db.job.update({
    where: { id },
    data: { status: 'QUEUED', runAt: new Date(), maxAttempts: job.attempts + 3, error: null, finishedAt: null, deadLetteredAt: null, failureKind: null, waitingReason: null },
  });
}

/** Retries every dead letter of a queue (after fixing what made them fail). */
export async function retryDeadLetters(organizationId: string, queue: string) {
  const jobs = await db.job.findMany({ where: { organizationId, queue, status: 'FAILED', deadLetteredAt: { not: null } }, select: { id: true, attempts: true } });
  for (const j of jobs) {
    await db.job.update({
      where: { id: j.id },
      data: { status: 'QUEUED', runAt: new Date(), maxAttempts: j.attempts + 3, error: null, finishedAt: null, deadLetteredAt: null, failureKind: null },
    });
  }
  return jobs.length;
}

/** Cancels work that hasn't started. A running job is left to finish: stopping it midway could leave partial effects. */
export async function cancelJob(organizationId: string, id: string) {
  const job = await db.job.findFirst({ where: { id, organizationId, status: { in: ['QUEUED', 'RETRYING', 'FAILED'] } } });
  if (!job) throw new NotFoundError('Job');
  return db.job.update({ where: { id }, data: { status: 'CANCELLED', finishedAt: new Date() } });
}
