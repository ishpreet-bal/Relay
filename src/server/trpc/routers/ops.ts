import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import { cancelJob, jobSummary, listJobs, retryJob } from '@/server/services/jobs';
import { connectorById, connectorStates } from '@/server/connectors/registry';
import { costSummary } from '@/server/services/usage';
import { NotFoundError } from '@/server/errors';
import { recordAudit } from '@/lib/audit';

const JOB_STATUSES = ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'RETRYING'] as const;

/** Operations: background work, connectors, and what everything costs. */
export const opsRouter = router({
  jobs: permissionProcedure('ops:read')
    .input(z.object({ status: z.array(z.enum(JOB_STATUSES)).optional(), limit: z.number().int().min(1).max(200).default(100) }).default({}))
    .query(({ ctx, input }) => listJobs(ctx.access.organizationId, input)),

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
      const result = await def.healthCheck();
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
