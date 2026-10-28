import { redactText } from '@/lib/redact';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, permissionProcedure } from '../init';
import { cancelJob, getJob, jobSummary, listJobs, queueStats, retryDeadLetters, retryJob } from '@/server/services/jobs';
import { QUEUES, QUEUE_NAMES, type QueueName } from '@/server/queues/registry';
import { queueRuntime, setQueueOverride } from '@/server/queues/settings';
import { listProviderThrottles, setProviderThrottle } from '@/server/queues/throttle';
import { connectorById, connectorStates } from '@/server/connectors/registry';
import { costSummary } from '@/server/services/usage';
import { NotFoundError } from '@/server/errors';
import { recordAudit } from '@/lib/audit';

const JOB_STATUSES = ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'RETRYING'] as const;
const queueName = z.enum(QUEUE_NAMES as [QueueName, ...QueueName[]]);

/** Queue limits and provider budgets apply to every workspace on this deployment. */
function assertPlatformOwner(role: string) {
  if (role !== 'SUPER_ADMIN') throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the workspace owner can change platform-wide queue and provider limits.' });
}

/** Operations: background work, connectors, and what everything costs. */
export const opsRouter = router({
  jobs: permissionProcedure('ops:read')
    .input(z.object({
      status: z.array(z.enum(JOB_STATUSES)).optional(),
      queue: queueName.optional(),
      deadLetter: z.boolean().optional(),
      limit: z.number().int().min(1).max(200).default(100),
    }).default({}))
    .query(({ ctx, input }) => listJobs(ctx.access.organizationId, input)),

  job: permissionProcedure('ops:read')
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => getJob(ctx.access.organizationId, input.id)),

  /** Every queue: its effective limits and this workspace's depth, speed, errors and cost. */
  queues: permissionProcedure('ops:read').query(async ({ ctx }) => {
    const stats = await queueStats(ctx.access.organizationId);
    return Promise.all(QUEUE_NAMES.filter((n) => n !== 'synthetic').map(async (name) => ({
      ...(await queueRuntime(name)),
      stats: stats.find((s) => s.queue === name) ?? null,
    })));
  }),

  setQueue: permissionProcedure('settings:write')
    .input(z.object({
      queue: queueName,
      paused: z.boolean().optional(),
      pausedReason: z.string().max(200).nullish(),
      concurrency: z.number().int().min(1).max(64).nullish(),
      perOrgConcurrency: z.number().int().min(1).max(64).nullish(),
      maxPerMinute: z.number().int().min(1).max(10_000).nullish(),
      timeoutMs: z.number().int().min(5_000).max(30 * 60_000).nullish(),
      maxAttempts: z.number().int().min(1).max(20).nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertPlatformOwner(ctx.session.role);
      const { queue, ...override } = input;
      const row = await setQueueOverride(queue, override, ctx.session.userId);
      await recordAudit({ session: ctx.session, action: 'queue.update', entityType: 'QueueSetting', entityId: queue, after: override });
      return row;
    }),

  retryDeadLetters: permissionProcedure('settings:write')
    .input(z.object({ queue: queueName }))
    .mutation(async ({ ctx, input }) => {
      const n = await retryDeadLetters(ctx.access.organizationId, input.queue);
      await recordAudit({ session: ctx.session, action: 'queue.retry_dead_letters', entityType: 'QueueSetting', entityId: input.queue, after: { retried: n } });
      return { retried: n };
    }),

  providers: permissionProcedure('ops:read').query(() => listProviderThrottles()),

  setProvider: permissionProcedure('settings:write')
    .input(z.object({
      provider: z.string().min(1).max(60),
      maxPerMinute: z.number().int().min(1).max(100_000).nullish(),
      failureThreshold: z.number().int().min(1).max(100).optional(),
      reset: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertPlatformOwner(ctx.session.role);
      const { provider, ...data } = input;
      const row = await setProviderThrottle(provider, { ...data, maxPerMinute: data.maxPerMinute === undefined ? undefined : data.maxPerMinute });
      await recordAudit({ session: ctx.session, action: data.reset ? 'provider.reset_breaker' : 'provider.update', entityType: 'ProviderThrottle', entityId: provider, after: data });
      return row;
    }),

  workers: permissionProcedure('ops:read').query(({ ctx }) =>
    ctx.db.workerHeartbeat.findMany({ orderBy: { lastSeenAt: 'desc' }, take: 20 }),
  ),

  queueDefinitions: permissionProcedure('ops:read').query(() => QUEUES),

  jobSummary: permissionProcedure('ops:read').query(({ ctx }) => jobSummary(ctx.access.organizationId)),

  retryJob: permissionProcedure('settings:write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => retryJob(ctx.access.organizationId, input.id)),

  cancelJob: permissionProcedure('settings:write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => cancelJob(ctx.access.organizationId, input.id)),

  failedResearch: permissionProcedure('ops:read').query(({ ctx }) =>
    ctx.db.research.findMany({
      where: { organizationId: ctx.access.organizationId, status: 'FAILED' },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, error: true, updatedAt: true, account: { select: { id: true, name: true } }, client: { select: { name: true } } },
    }),
  ),

  aiRuns: permissionProcedure('ops:read')
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }).default({}))
    .query(({ ctx, input }) =>
      ctx.db.aiRun.findMany({ where: { organizationId: ctx.access.organizationId }, orderBy: { createdAt: 'desc' }, take: input.limit }),
    ),

  connectors: permissionProcedure('ops:read').query(({ ctx }) => connectorStates(ctx.access.organizationId)),

  setConnector: permissionProcedure('connector:manage')
    .input(z.object({ provider: z.string().max(60), enabled: z.boolean().optional(), priority: z.number().int().min(1).max(999).optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!connectorById(input.provider)) throw new NotFoundError('Connector');
      const setting = await ctx.db.connectorSetting.upsert({
        where: { organizationId_provider: { organizationId: ctx.access.organizationId, provider: input.provider } },
        create: { organizationId: ctx.access.organizationId, provider: input.provider, enabled: input.enabled ?? true, priority: input.priority ?? 100 },
        update: { ...(input.enabled !== undefined ? { enabled: input.enabled } : {}), ...(input.priority !== undefined ? { priority: input.priority } : {}) },
      });
      await recordAudit({ session: ctx.session, action: 'connector.update', entityType: 'ConnectorSetting', entityId: setting.id, after: input });
      return setting;
    }),

  testConnector: permissionProcedure('connector:manage')
    .input(z.object({ provider: z.string().max(60) }))
    .mutation(async ({ ctx, input }) => {
      const def = connectorById(input.provider);
      if (!def) throw new NotFoundError('Connector');
      if (!def.healthCheck) return { ok: false, detail: 'This connector has no health check.' };
      let result: { ok: boolean; detail: string };
      try { result = await def.healthCheck(); } catch (err) { result = { ok: false, detail: err instanceof Error ? err.message : 'Connection test failed' }; }
      result.detail = redactText(result.detail);
      await ctx.db.connectorSetting.upsert({
        where: { organizationId_provider: { organizationId: ctx.access.organizationId, provider: input.provider } },
        create: { organizationId: ctx.access.organizationId, provider: input.provider, lastCheckedAt: new Date(), lastError: result.ok ? null : result.detail },
        update: { lastCheckedAt: new Date(), lastError: result.ok ? null : result.detail },
      });
      return result;
    }),

  providerLog: permissionProcedure('ops:read')
    .input(z.object({ provider: z.string().max(60).optional(), limit: z.number().int().min(1).max(200).default(50) }).default({}))
    .query(({ ctx, input }) =>
      ctx.db.providerRecord.findMany({
        where: { organizationId: ctx.access.organizationId, ...(input.provider ? { provider: input.provider } : {}) },
        orderBy: { requestedAt: 'desc' },
        take: input.limit,
        select: {
          id: true, provider: true, operation: true, lookupKey: true, status: true, costMillicents: true,
          confidence: true, error: true, requestedAt: true, expiresAt: true,
        },
      }),
    ),

  costs: permissionProcedure('ops:read')
    .input(z.object({ clientId: z.string().uuid().nullish(), days: z.number().int().min(1).max(365).default(30) }).default({}))
    .query(({ ctx, input }) => costSummary(ctx.access, input)),
});
