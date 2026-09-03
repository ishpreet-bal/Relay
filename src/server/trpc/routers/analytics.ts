import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import { compareTiers, enforceContextualGuardrail } from '@/server/services/tier-performance';
import { recordAudit } from '@/lib/audit';

export const analyticsRouter = router({
  tierComparison: permissionProcedure('message:read')
    .input(z.object({ windowDays: z.number().min(7).max(365).default(90) }).default({ windowDays: 90 }))
    .query(({ ctx, input }) => compareTiers(ctx.session.organizationId, input.windowDays)),

  contextualSetting: permissionProcedure('settings:read').query(({ ctx }) =>
    ctx.db.organization.findUniqueOrThrow({
      where: { id: ctx.session.organizationId },
      select: { allowContextual: true, contextualPausedAt: true, contextualPauseReason: true },
    }),
  ),

  setContextual: permissionProcedure('settings:write')
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organization.update({
        where: { id: ctx.session.organizationId },
        data: {
          allowContextual: input.enabled,
          contextualPausedAt: input.enabled ? null : new Date(),
          contextualPauseReason: input.enabled ? null : 'Turned off manually',
        },
      });
      await recordAudit({
        session: ctx.session, action: 'settings.contextual', entityType: 'Organization',
        entityId: org.id, after: { allowContextual: input.enabled },
      });
      return org;
    }),

  /** Manual trigger for the same check the scheduler runs. */
  runGuardrail: permissionProcedure('settings:write')
    .mutation(({ ctx }) => enforceContextualGuardrail(ctx.session.organizationId)),
});
