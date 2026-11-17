import { isLimitedStaff } from '@/server/access/scope';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import { funnel, meetingsTrend, windowFromDays } from '@/server/services/analytics/funnel';
import {
  callerBreakdown, campaignBreakdown, contactBreakdown, insightsFrom, messageBreakdown, objectionBreakdown, signalBreakdown,
} from '@/server/services/analytics/breakdowns';
import { compareTiers, enforceContextualGuardrail } from '@/server/services/tier-performance';
import { recordAudit } from '@/lib/audit';

const scopeInput = z.object({ clientId: z.string().uuid().nullish(), days: z.number().int().min(7).max(730).default(90) });

export const analyticsRouter = router({
  funnel: permissionProcedure('analytics:read')
    .input(scopeInput)
    .query(({ ctx, input }) => funnel(ctx.access, { clientId: input.clientId, window: windowFromDays(input.days) })),

  trend: permissionProcedure('analytics:read')
    .input(z.object({ clientId: z.string().uuid().nullish(), weeks: z.number().int().min(4).max(52).default(12) }))
    .query(({ ctx, input }) => meetingsTrend(ctx.access, input)),

  contactBreakdown: permissionProcedure('analytics:read')
    .input(scopeInput.extend({ dimension: z.enum(['seniority', 'department', 'industry', 'companySize', 'title']) }))
    .query(async ({ ctx, input }) => {
      const rows = await contactBreakdown(ctx.access, { clientId: input.clientId, window: windowFromDays(input.days), dimension: input.dimension });
      const labels = { seniority: 'Seniority', department: 'Department', industry: 'Industry', companySize: 'Company size', title: 'Title' } as const;
      return { rows, insights: insightsFrom(labels[input.dimension], rows) };
    }),

  signalBreakdown: permissionProcedure('analytics:read')
    .input(scopeInput)
    .query(async ({ ctx, input }) => {
      const rows = await signalBreakdown(ctx.access, { clientId: input.clientId, window: windowFromDays(input.days) });
      return { rows, insights: insightsFrom('Accounts with signal', rows) };
    }),

  messageBreakdown: permissionProcedure('analytics:read')
    .input(scopeInput.extend({ dimension: z.enum(['angle', 'stepOrder', 'ctaType']) }))
    .query(({ ctx, input }) => messageBreakdown(ctx.access, { clientId: input.clientId, window: windowFromDays(input.days), dimension: input.dimension })),

  campaignBreakdown: permissionProcedure('analytics:read')
    .input(scopeInput)
    .query(({ ctx, input }) => campaignBreakdown(ctx.access, { clientId: input.clientId, window: windowFromDays(input.days) })),

  callerBreakdown: permissionProcedure('analytics:read')
    .input(scopeInput)
    .query(({ ctx, input }) => callerBreakdown(ctx.access, { clientId: input.clientId, window: windowFromDays(input.days) })),

  objections: permissionProcedure('analytics:read')
    .input(scopeInput)
    .query(({ ctx, input }) => objectionBreakdown(ctx.access, { clientId: input.clientId, window: windowFromDays(input.days) })),

  // Personalization-tier comparison and its automatic guardrail.
  tierComparison: permissionProcedure('message:read')
    .input(z.object({ windowDays: z.number().min(7).max(365).default(90) }).default({ windowDays: 90 }))
    .query(({ ctx, input }) => {
      // A workspace-wide comparison; staff limited to some clients don't see other clients' results.
      if (isLimitedStaff(ctx.access)) throw new TRPCError({ code: 'FORBIDDEN', message: 'Tier comparison covers every client.' });
      return compareTiers(ctx.access.organizationId, input.windowDays);
    }),

  contextualSetting: permissionProcedure('settings:read').query(({ ctx }) =>
    ctx.db.organization.findUniqueOrThrow({
      where: { id: ctx.access.organizationId },
      select: { allowContextual: true, contextualPausedAt: true, contextualPauseReason: true },
    }),
  ),

  setContextual: permissionProcedure('settings:write')
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.update({
        where: { id: ctx.access.organizationId },
        data: {
          allowContextual: input.enabled,
          contextualPausedAt: input.enabled ? null : new Date(),
          contextualPauseReason: input.enabled ? null : 'Turned off manually',
        },
      });
      await recordAudit({ session: ctx.session, action: 'settings.contextual', entityType: 'Organization', entityId: org.id, after: { allowContextual: input.enabled } });
      return org;
    }),

  runGuardrail: permissionProcedure('settings:write')
    .mutation(({ ctx }) => enforceContextualGuardrail(ctx.access.organizationId)),
});
