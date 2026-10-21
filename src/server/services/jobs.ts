import { Prisma, type Job, type JobType } from '@prisma/client';
import { db } from '@/lib/db';
import { NotFoundError } from '@/server/errors';

/**
 * Background jobs on Postgres, claimed with FOR UPDATE SKIP LOCKED — the same
 * no-queue-service design the worker already used, generalized. A job is
 * transactional with the data it acts on, survives restarts, and is visible
 * to admins with its attempts and last error.
 *
 * Retries back off exponentially; after maxAttempts a job is FAILED and stays
 * on the System page until someone retries or cancels it.
 */

export async function enqueueJob(params: {
  type: JobType;
  organizationId?: string | null;
  clientId?: string | null;
  payload?: Prisma.InputJsonValue;
  entityType?: string;
  entityId?: string;
  runAt?: Date;
  maxAttempts?: number;
  /** Skip if the same work is already queued or running. */
  dedupeKey?: string;
  createdById?: string | null;
}): Promise<Job | null> {
  if (params.dedupeKey) {
    const pending = await db.job.findFirst({
      where: { dedupeKey: params.dedupeKey, status: { in: ['QUEUED', 'RUNNING', 'RETRYING'] } },
    });
    if (pending) return null;
  }
  return db.job.create({
    data: {
      type: params.type,
      organizationId: params.organizationId ?? null,
      clientId: params.clientId ?? null,
      payload: params.payload,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      runAt: params.runAt ?? new Date(),
      maxAttempts: params.maxAttempts ?? 3,
      dedupeKey: params.dedupeKey ?? null,
      createdById: params.createdById ?? null,
    },
  });
}

export async function claimJobs(workerId: string, limit: number, types?: JobType[]): Promise<Job[]> {
  const only = types?.length ? Prisma.sql`AND type::text IN (${Prisma.join(types)})` : Prisma.empty;
  const claimed = await db.$queryRaw<Array<{ id: string }>>`
    UPDATE "Job"
    SET status = 'RUNNING', "lockedAt" = NOW(), "lockedBy" = ${workerId}, "startedAt" = NOW(),
        attempts = attempts + 1, "updatedAt" = NOW()
    WHERE id IN (
      SELECT id FROM "Job"
      WHERE status IN ('QUEUED', 'RETRYING') AND "runAt" <= NOW() ${only}
      ORDER BY "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id;
  `;
  if (!claimed.length) return [];
  return db.job.findMany({ where: { id: { in: claimed.map((c) => c.id) } } });
}

/**
 * Claims one specific job, also taking it over when its holder has gone
 * quiet for `staleAfterMs` (a serverless step that hit its time limit).
 */
export async function claimJob(id: string, workerId: string, staleAfterMs: number): Promise<Job | null> {
  const staleBefore = new Date(Date.now() - staleAfterMs);
  const claimed = await db.$queryRaw<Array<{ id: string }>>`
    UPDATE "Job"
    SET status = 'RUNNING', "lockedAt" = NOW(), "lockedBy" = ${workerId}, "startedAt" = COALESCE("startedAt", NOW()),
        attempts = attempts + 1, "updatedAt" = NOW()
    WHERE id = (
      SELECT id FROM "Job"
      WHERE id = ${id}::uuid
        AND (status IN ('QUEUED', 'RETRYING') OR (status = 'RUNNING' AND "lockedAt" < ${staleBefore}))
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id;
  `;
  return claimed.length ? db.job.findUnique({ where: { id } }) : null;
}

/**
 * Puts a job that made progress but isn't finished back in the queue. The
 * attempt is not counted: only failures use up attempts.
 */
export async function requeueJob(id: string, runAt = new Date()) {
  return db.job.update({
    where: { id },
    data: { status: 'QUEUED', runAt, lockedAt: null, lockedBy: null, attempts: { decrement: 1 }, error: null },
  });
}

export async function completeJob(id: string, result?: Prisma.InputJsonValue) {
  return db.job.update({
    where: { id },
    data: { status: 'COMPLETED', result, error: null, finishedAt: new Date(), lockedAt: null, lockedBy: null },
  });
}

/** Retries with backoff (1, 4, 16 minutes…) until attempts run out. */
export async function failJob(job: Job, error: unknown, opts: { retryable?: boolean } = {}) {
  const message = error instanceof Error ? error.message : String(error);
  const retry = opts.retryable !== false && job.attempts < job.maxAttempts;
  return db.job.update({
    where: { id: job.id },
    data: retry
      ? { status: 'RETRYING', error: message.slice(0, 1000), runAt: new Date(Date.now() + 60_000 * 4 ** (job.attempts - 1)), lockedAt: null, lockedBy: null }
      : { status: 'FAILED', error: message.slice(0, 1000), finishedAt: new Date(), lockedAt: null, lockedBy: null },
  });
}

/** Releases jobs whose worker died mid-run, so they are picked up again. */
export async function releaseStaleJobs(olderThanMinutes = 30) {
  return db.job.updateMany({
    where: { status: 'RUNNING', lockedAt: { lt: new Date(Date.now() - olderThanMinutes * 60_000) } },
    data: { status: 'RETRYING', lockedAt: null, lockedBy: null, error: 'Worker stopped before finishing; retrying' },
  });
}

export async function listJobs(organizationId: string, params: { status?: Job['status'][]; type?: JobType; limit?: number }) {
  return db.job.findMany({
    where: {
      organizationId,
      ...(params.status?.length ? { status: { in: params.status } } : {}),
      ...(params.type ? { type: params.type } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: params.limit ?? 100,
  });
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

export async function retryJob(organizationId: string, id: string) {
  const job = await db.job.findFirst({ where: { id, organizationId } });
  if (!job) throw new NotFoundError('Job');
  return db.job.update({
    where: { id },
    data: { status: 'QUEUED', runAt: new Date(), maxAttempts: job.attempts + 3, error: null, finishedAt: null },
  });
}

export async function cancelJob(organizationId: string, id: string) {
  const job = await db.job.findFirst({ where: { id, organizationId, status: { in: ['QUEUED', 'RETRYING', 'FAILED'] } } });
  if (!job) throw new NotFoundError('Job');
  return db.job.update({ where: { id }, data: { status: 'CANCELLED', finishedAt: new Date() } });
}
