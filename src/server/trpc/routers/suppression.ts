import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import { suppress } from '@/server/services/suppression';
import { recordAudit } from '@/lib/audit';

export const suppressionRouter = router({
  list: permissionProcedure('suppression:read')
    .input(z.object({ search: z.string().max(120).optional(), limit: z.number().min(1).max(200).default(100) }))
    .query(({ ctx, input }) =>
      ctx.db.suppression.findMany({
        where: {
          organizationId: ctx.session.organizationId,
          ...(input.search ? { value: { contains: input.search.toLowerCase(), mode: 'insensitive' } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
      }),
    ),

  add: permissionProcedure('suppression:write')
    .input(z.object({
      value: z.string().min(3).max(200),
      scope: z.enum(['EMAIL', 'DOMAIN']).default('EMAIL'),
      reason: z.enum(['UNSUBSCRIBE', 'MANUAL', 'HARD_BOUNCE', 'SPAM_COMPLAINT', 'DO_NOT_CONTACT', 'COMPETITOR', 'EXISTING_CLIENT']).default('MANUAL'),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await suppress({ organizationId: ctx.session.organizationId, ...input });
      await recordAudit({
        session: ctx.session, action: 'suppression.add', entityType: 'Suppression',
        entityId: result.entry.id, after: input,
      });
      return result;
    }),

  /**
   * Removal is permitted but always audited, and never for bounces or
   * complaints — those are the provider's judgment, not ours to overrule.
   */
  remove: permissionProcedure('suppression:write')
    .input(z.object({ id: z.string().uuid(), justification: z.string().min(5).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.suppression.findFirst({
        where: { id: input.id, organizationId: ctx.session.organizationId },
      });
      if (!entry) return { ok: false, reason: 'Not found' };
      if (entry.reason === 'HARD_BOUNCE' || entry.reason === 'SPAM_COMPLAINT' || entry.reason === 'UNSUBSCRIBE') {
        return { ok: false, reason: 'Opt-outs, bounces, and complaints cannot be removed.' };
      }

      await ctx.db.suppression.delete({ where: { id: input.id } });
      await recordAudit({
        session: ctx.session, action: 'suppression.remove', entityType: 'Suppression',
        entityId: input.id, before: entry, after: { justification: input.justification },
      });
      return { ok: true };
    }),
});
