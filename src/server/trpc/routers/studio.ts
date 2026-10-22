import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import { can } from '@/lib/rbac';
import { recordAudit } from '@/lib/audit';
import { MODULES } from '@/server/studio/modules';
import { BUILTIN_TEMPLATES } from '@/server/studio/templates';
import { heartbeat, runJobNow } from '@/server/services/job-runner';
import {
  checkConnection, connectionSchema, createApplication, createApplicationSchema, createConnection, decideApproval, deployConfig, disconnect,
  forkTemplate, getApplication, getExecution, getTemplate, listApplications, listConnections, listRecords, listTemplates, previewConfig,
  publishTemplateVersion, rollback, rotateWebhookToken, saveConfig, setApplicationStatus, startExecution, upgradeApplication,
} from '@/server/studio/applications';

const id = z.string().uuid();
const jsonInput = z.record(z.string(), z.unknown()).refine((v) => JSON.stringify(v).length <= 64_000, 'Input is larger than 64 KB');

/**
 * Studio: customer applications built from templates.
 *
 * Reading and running are open to the customer's own users (scoped to their
 * client by ctx.access); configuring needs studio:write; going to production,
 * rolling back and archiving need studio:deploy; customer credentials need
 * studio:secrets.
 */
export const studioRouter = router({
  modules: permissionProcedure('studio:read').query(() =>
    MODULES.map((m) => ({
      key: m.key, name: m.name, version: m.version, category: m.category, description: m.description, permissions: m.permissions,
      steps: m.steps.map((s) => ({ type: s.type, label: s.label, description: s.description, usesIntegration: !!s.usesIntegration })),
    }))),

  templates: permissionProcedure('studio:read').query(async ({ ctx }) => {
    const rows = await listTemplates(ctx.access);
    return rows.map((t) => ({ ...t, builtin: t.organizationId === null }));
  }),

  template: permissionProcedure('studio:read').input(z.object({ id })).query(({ ctx, input }) => getTemplate(ctx.access, input.id)),

  builtinCatalogue: permissionProcedure('studio:read').query(() => BUILTIN_TEMPLATES.map((t) => ({ slug: t.slug, name: t.name, industry: t.industry, version: t.version }))),

  forkTemplate: permissionProcedure('studio:write')
    .input(z.object({ templateVersionId: id, slug: z.string(), name: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const t = await forkTemplate(ctx.access, ctx.session.userId, input.templateVersionId, input);
      await recordAudit({ session: ctx.session, action: 'studio.template.fork', entityType: 'AppTemplate', entityId: t.id, after: input });
      return t;
    }),

  publishTemplateVersion: permissionProcedure('studio:write')
    .input(z.object({ templateId: id, version: z.string(), manifest: z.unknown(), changelog: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const v = await publishTemplateVersion(ctx.access, ctx.session.userId, input.templateId, { ...input, manifest: input.manifest ?? null });
      await recordAudit({ session: ctx.session, action: 'studio.template.publish', entityType: 'AppTemplateVersion', entityId: v.id, after: { templateId: input.templateId, version: input.version } });
      return v;
    }),

  applications: permissionProcedure('studio:read')
    .input(z.object({ clientId: id.nullish() }).default({}))
    .query(({ ctx, input }) => listApplications(ctx.access, input.clientId)),

  application: permissionProcedure('studio:read').input(z.object({ id })).query(({ ctx, input }) => getApplication(ctx.access, input.id)),

  createApplication: permissionProcedure('studio:write')
    .input(createApplicationSchema)
    .mutation(async ({ ctx, input }) => {
      const res = await createApplication(ctx.access, ctx.session.userId, input);
      await recordAudit({ session: ctx.session, action: 'studio.app.create', entityType: 'ClientApplication', entityId: res.app.id, after: { clientId: input.clientId, templateVersionId: input.templateVersionId } });
      return res;
    }),

  previewConfig: permissionProcedure('studio:write')
    .input(z.object({ applicationId: id, overrides: z.unknown(), templateVersionId: id.optional() }))
    .mutation(({ ctx, input }) => previewConfig(ctx.access, input.applicationId, input.overrides, input.templateVersionId)),

  saveConfig: permissionProcedure('studio:write')
    .input(z.object({ applicationId: id, overrides: z.unknown(), notes: z.string().trim().max(500).nullish() }))
    .mutation(async ({ ctx, input }) => {
      const config = await saveConfig(ctx.access, ctx.session.userId, input.applicationId, input.overrides, input.notes ?? null);
      await recordAudit({ session: ctx.session, action: 'studio.config.save', entityType: 'AppConfigVersion', entityId: config.id, after: { applicationId: input.applicationId, version: config.version, status: config.status } });
      return config;
    }),

  upgrade: permissionProcedure('studio:write')
    .input(z.object({ applicationId: id, templateVersionId: id }))
    .mutation(async ({ ctx, input }) => {
      const res = await upgradeApplication(ctx.access, ctx.session.userId, input.applicationId, input.templateVersionId);
      await recordAudit({ session: ctx.session, action: 'studio.app.upgrade', entityType: 'ClientApplication', entityId: input.applicationId, after: { templateVersionId: input.templateVersionId, breaking: res.breaking } });
      return res;
    }),

  deploy: permissionProcedure('studio:write')
    .input(z.object({ applicationId: id, configVersionId: id, environment: z.enum(['SANDBOX', 'PRODUCTION']), notes: z.string().trim().max(500).nullish() }))
    .mutation(async ({ ctx, input }) => {
      if (input.environment === 'PRODUCTION' && !can(ctx.session.role, 'studio:deploy')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Production deployments need an admin.' });
      }
      const d = await deployConfig(ctx.access, ctx.session.userId, input.applicationId, input.configVersionId, input.environment, input.notes ?? null);
      await recordAudit({ session: ctx.session, action: 'studio.deploy', entityType: 'AppDeployment', entityId: d.id, after: input });
      return d;
    }),

  rollback: permissionProcedure('studio:deploy')
    .input(z.object({ applicationId: id }))
    .mutation(async ({ ctx, input }) => {
      const d = await rollback(ctx.access, ctx.session.userId, input.applicationId);
      await recordAudit({ session: ctx.session, action: 'studio.rollback', entityType: 'AppDeployment', entityId: d.id, after: { applicationId: input.applicationId, to: d.configVersionId } });
      return d;
    }),

  setStatus: permissionProcedure('studio:write')
    .input(z.object({ applicationId: id, status: z.enum(['PAUSED', 'ACTIVE', 'ARCHIVED']) }))
    .mutation(async ({ ctx, input }) => {
      // Pausing is a safety action anyone configuring may take; resuming or archiving needs an admin.
      if (input.status !== 'PAUSED' && !can(ctx.session.role, 'studio:deploy')) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only an admin can resume or archive an application.' });
      }
      const app = await setApplicationStatus(ctx.access, input.applicationId, input.status);
      await recordAudit({ session: ctx.session, action: 'studio.app.status', entityType: 'ClientApplication', entityId: app.id, after: input });
      return app;
    }),

  run: permissionProcedure('studio:run')
    .input(z.object({ applicationId: id, workflowKey: z.string().min(1).max(60), input: jsonInput.nullish(), test: z.boolean().default(false), configVersionId: id.optional() }))
    .mutation(({ ctx, input }) =>
      startExecution(ctx.access, ctx.session.userId, input.applicationId, input.workflowKey, input.input ?? null, {
        test: input.test, configVersionId: input.configVersionId, trigger: input.test ? 'TEST' : 'MANUAL',
      })),

  execution: permissionProcedure('studio:read').input(z.object({ id })).query(({ ctx, input }) => getExecution(ctx.access, input.id)),

  /**
   * Works an execution's job from the page while it's open, so runs make
   * progress on deployments without a worker. The job queue's claim keeps
   * this and a worker from running the same attempt at once.
   */
  step: permissionProcedure('studio:run')
    .input(z.object({ executionId: id }))
    .mutation(async ({ ctx, input }) => {
      const exec = await getExecution(ctx.access, input.executionId);
      if (['QUEUED', 'RUNNING'].includes(exec.status) && exec.jobId) {
        const ran = await runJobNow(exec.jobId, `web:${ctx.session.userId}`, { deadline: Date.now() + 45_000 });
        if (ran) await heartbeat('web', 'page', 1, null);
      }
      return getExecution(ctx.access, input.executionId);
    }),

  executions: permissionProcedure('studio:read')
    .input(z.object({ applicationId: id, status: z.string().max(30).optional(), isTest: z.boolean().optional(), cursor: id.optional(), limit: z.number().int().min(1).max(100).default(30) }))
    .query(async ({ ctx, input }) => {
      const app = await getApplication(ctx.access, input.applicationId);
      const rows = await ctx.db.workflowExecution.findMany({
        where: { applicationId: app.app.id, clientId: app.app.clientId, ...(input.status ? { status: input.status } : {}), ...(input.isTest === undefined ? {} : { isTest: input.isTest }) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: { id: true, workflowKey: true, trigger: true, isTest: true, status: true, error: true, createdAt: true, startedAt: true, finishedAt: true, durationMs: true, configVersionId: true },
      });
      return { items: rows.slice(0, input.limit), nextCursor: rows.length > input.limit ? rows[input.limit - 1]!.id : null };
    }),

  decide: permissionProcedure('studio:run')
    .input(z.object({ executionId: id, decision: z.enum(['APPROVE', 'REJECT']), note: z.string().trim().max(500).nullish() }))
    .mutation(async ({ ctx, input }) => {
      const exec = await decideApproval(ctx.access, ctx.session.userId, input.executionId, input.decision, input.note ?? null);
      await recordAudit({ session: ctx.session, action: 'studio.approval', entityType: 'WorkflowExecution', entityId: input.executionId, after: { decision: input.decision, note: input.note } });
      return exec;
    }),

  records: permissionProcedure('studio:read')
    .input(z.object({ applicationId: id, collection: z.string().min(1).max(60), isTest: z.boolean().default(false), limit: z.number().int().min(1).max(200).default(50) }))
    .query(({ ctx, input }) => listRecords(ctx.access, input.applicationId, input.collection, { isTest: input.isTest, limit: input.limit })),

  connections: permissionProcedure('studio:read')
    .input(z.object({ clientId: id.nullish() }).default({}))
    .query(({ ctx, input }) => listConnections(ctx.access, input.clientId)),

  createConnection: permissionProcedure('studio:secrets')
    .input(connectionSchema)
    .mutation(async ({ ctx, input }) => {
      const conn = await createConnection(ctx.access, ctx.session.userId, input);
      // Never the secret itself.
      await recordAudit({ session: ctx.session, action: 'studio.connection.create', entityType: 'IntegrationConnection', entityId: conn.id, after: { clientId: input.clientId, provider: input.provider, label: input.label, baseUrl: input.baseUrl, hasSecret: !!input.secret, isSandbox: input.isSandbox } });
      return conn;
    }),

  checkConnection: permissionProcedure('studio:secrets').input(z.object({ id })).mutation(({ ctx, input }) => checkConnection(ctx.access, input.id)),

  disconnect: permissionProcedure('studio:secrets')
    .input(z.object({ id }))
    .mutation(async ({ ctx, input }) => {
      await disconnect(ctx.access, input.id);
      await recordAudit({ session: ctx.session, action: 'studio.connection.disconnect', entityType: 'IntegrationConnection', entityId: input.id });
      return { ok: true };
    }),

  /** Issues the token a customer's system uses to start webhook workflows. Shown once. */
  rotateWebhookToken: permissionProcedure('studio:secrets')
    .input(z.object({ applicationId: id }))
    .mutation(async ({ ctx, input }) => {
      const res = await rotateWebhookToken(ctx.access, input.applicationId);
      await recordAudit({ session: ctx.session, action: 'studio.webhook.rotate', entityType: 'ClientApplication', entityId: input.applicationId });
      return res;
    }),
});
