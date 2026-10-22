import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import { clientFilter } from '@/server/access/scope';
import { funnelMetrics } from '@/server/services/pipeline/funnel';
import { getPipelineSettings, pipelineSettingsSchema, updatePipelineSettings } from '@/server/services/pipeline/settings';
import { budgetStatus, refreshBudgetAlerts } from '@/server/services/pipeline/budgets';
import { assumptionsFrom, forecast, standardForecasts, DEFAULT_COST_ASSUMPTIONS } from '@/server/services/pipeline/forecast';
import { enqueuePendingScreening, markForScreening, queueAnalysis, queueDeepResearch, releaseStage, setStage } from '@/server/services/pipeline/gates';
import { listVersions } from '@/server/services/pipeline/versions';
import { acknowledgeAlert, listAlerts } from '@/server/services/alerts';
import { NotFoundError } from '@/server/errors';
import { recordAudit } from '@/lib/audit';

const STAGES = ['DISCOVERED', 'SCREENED_OUT', 'QUALIFIED', 'ANALYZED', 'DEEP_RESEARCHED'] as const;
const assumptionsSchema = z.record(z.string(), z.number().min(0).max(1_000_000));

/** The research funnel: where accounts are, what it costs, and the controls on each gate. */
export const pipelineRouter = router({
  metrics: permissionProcedure('account:read')
    .input(z.object({ clientId: z.string().uuid().nullish() }).default({}))
    .query(({ ctx, input }) => funnelMetrics(ctx.access, input.clientId)),

  settings: permissionProcedure('account:read').query(({ ctx }) => getPipelineSettings(ctx.access.organizationId)),

  updateSettings: permissionProcedure('settings:write')
    .input(pipelineSettingsSchema.extend({ costAssumptions: assumptionsSchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      const { costAssumptions, ...rest } = input;
      const row = await updatePipelineSettings(ctx.access.organizationId, ctx.session.userId, rest);
      if (costAssumptions) {
        await ctx.db.pipelineSettings.update({ where: { organizationId: ctx.access.organizationId }, data: { costAssumptions: assumptionsFrom(costAssumptions) as never } });
      }
      await refreshBudgetAlerts(ctx.access.organizationId);
      await recordAudit({ session: ctx.session, action: 'pipeline.settings', entityType: 'PipelineSettings', entityId: ctx.access.organizationId, after: input });
      return row;
    }),

  budgets: permissionProcedure('account:read').query(({ ctx }) => budgetStatus(ctx.access.organizationId)),

  /** Projected monthly cost for 1k–1M stored companies, or a custom scenario. */
  forecast: permissionProcedure('account:read')
    .input(z.object({
      scenario: z.object({
        storedCompanies: z.number().int().min(0).max(100_000_000),
        discoveredPerMonth: z.number().int().min(0).max(100_000_000),
        refreshedPerMonth: z.number().int().min(0).max(100_000_000),
        analysedPerMonth: z.number().int().min(0).max(10_000_000),
        deepPerMonth: z.number().int().min(0).max(1_000_000),
      }).optional(),
    }).default({}))
    .query(async ({ ctx, input }) => {
      const settings = await getPipelineSettings(ctx.access.organizationId);
      const assumptions = assumptionsFrom(settings.costAssumptions);
      return {
        assumptions,
        defaults: DEFAULT_COST_ASSUMPTIONS,
        standard: standardForecasts(assumptions),
        custom: input.scenario ? forecast(input.scenario, assumptions) : null,
      };
    }),

  /** Accounts at one stage, best first, with why they're there. */
  stageAccounts: permissionProcedure('account:read')
    .input(z.object({ stage: z.enum(STAGES), clientId: z.string().uuid().nullish(), cursor: z.string().uuid().nullish(), limit: z.number().int().min(1).max(100).default(25) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.account.findMany({
        where: { ...clientFilter(ctx.access, input.clientId), deletedAt: null, pipelineStage: input.stage },
        orderBy: [{ screeningScore: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: {
          id: true, name: true, domain: true, city: true, industry: true, screeningScore: true, screeningReasons: true, opportunityTier: true,
          stagePinned: true, promotionNote: true, researchVersion: true, lastResearchedAt: true, nextRefreshAt: true, researchCostMillicents: true,
          client: { select: { name: true } },
        },
      });
      return { items: rows.slice(0, input.limit), nextCursor: rows.length > input.limit ? rows[input.limit]!.id : null };
    }),

  screenPending: permissionProcedure('account:import').mutation(async ({ ctx }) => ({ queued: await enqueuePendingScreening(ctx.access.organizationId) })),

  rescreen: permissionProcedure('account:write')
    .input(z.object({ accountId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const a = await ctx.db.account.findFirst({ where: { id: input.accountId, ...clientFilter(ctx.access) }, select: { id: true } });
      if (!a) throw new NotFoundError('Account');
      await markForScreening(a.id);
      return { queued: await enqueuePendingScreening(ctx.access.organizationId) };
    }),

  analyze: permissionProcedure('research:run')
    .input(z.object({ accountId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const a = await ctx.db.account.findFirst({ where: { id: input.accountId, ...clientFilter(ctx.access) }, select: { id: true } });
      if (!a) throw new NotFoundError('Account');
      const job = await queueAnalysis(ctx.access.organizationId, a.id, 'MANUAL', ctx.session.userId);
      await recordAudit({ session: ctx.session, action: 'pipeline.analyze', entityType: 'Account', entityId: a.id });
      return { jobId: job?.id ?? null };
    }),

  deepResearch: permissionProcedure('research:run')
    .input(z.object({ accountId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const a = await ctx.db.account.findFirst({ where: { id: input.accountId, ...clientFilter(ctx.access) }, select: { id: true } });
      if (!a) throw new NotFoundError('Account');
      const job = await queueDeepResearch(ctx.access.organizationId, a.id, 'MANUAL', ctx.session.userId);
      await recordAudit({ session: ctx.session, action: 'pipeline.deep_research', entityType: 'Account', entityId: a.id });
      return { jobId: job?.id ?? null };
    }),

  setStage: permissionProcedure('account:override')
    .input(z.object({ accountId: z.string().uuid(), stage: z.enum(STAGES), note: z.string().trim().max(500).nullish() }))
    .mutation(async ({ ctx, input }) => {
      await setStage(ctx.access, ctx.session.userId, input.accountId, input.stage, input.note ?? null);
      await recordAudit({ session: ctx.session, action: 'pipeline.set_stage', entityType: 'Account', entityId: input.accountId, after: input });
      return { ok: true };
    }),

  releaseStage: permissionProcedure('account:override')
    .input(z.object({ accountId: z.string().uuid() }))
    .mutation(({ ctx, input }) => releaseStage(ctx.access, input.accountId)),

  versions: permissionProcedure('research:read')
    .input(z.object({ accountId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const a = await ctx.db.account.findFirst({ where: { id: input.accountId, ...clientFilter(ctx.access) }, select: { id: true } });
      if (!a) throw new NotFoundError('Account');
      return listVersions(a.id);
    }),

  alerts: permissionProcedure('ops:read')
    .input(z.object({ includeResolved: z.boolean().default(false) }).default({}))
    .query(({ ctx, input }) => listAlerts(ctx.access.organizationId, input)),

  acknowledgeAlert: permissionProcedure('ops:read')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => acknowledgeAlert(ctx.access.organizationId, ctx.session.userId, input.id)),
});
