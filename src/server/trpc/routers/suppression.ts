import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import { releaseSuppression, suppress } from '@/server/services/suppression';
import { clientFilter } from '@/server/access/scope';
import { recordAudit } from '@/lib/audit';

const PERMANENT = ['HARD_BOUNCE', 'SPAM_COMPLAINT', 'UNSUBSCRIBE', 'DO_NOT_CALL', 'DO_NOT_CONTACT'] as const;

export const suppressionRouter = router({
  list: permissionProcedure('suppression:read')
    .input(z.object({ search: z.string().max(120).optional(), limit: z.number().min(1).max(500).default(200) }))
    .query(({ ctx, input }) => {
      const scope = clientFilter(ctx.access);
      return ctx.db.suppression.findMany({
        where: {
          organizationId: ctx.access.organizationId,
          // Workspace-wide entries plus those for clients in scope.
          OR: [{ clientId: null }, ...(scope.clientId ? [{ clientId: scope.clientId }] : [{ clientId: { not: null } }])],
          ...(input.search ? { value: { contains: input.search.toLowerCase(), mode: 'insensitive' } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        include: { client: { select: { name: true } } },
      });
    }),

  add: permissionProcedure('suppression:write')
    .input(z.object({
      value: z.string().trim().min(3).max(200),
      scope: z.enum(['EMAIL', 'DOMAIN', 'PHONE']).default('EMAIL'),
      channel: z.enum(['ALL', 'EMAIL', 'PHONE']).default('ALL'),
      reason: z.enum(['MANUAL', 'DO_NOT_CONTACT', 'DO_NOT_CALL', 'COMPETITOR', 'EXISTING_CLIENT', 'UNSUBSCRIBE']).default('MANUAL'),
      clientId: z.string().uuid().nullish(),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.clientId) clientFilter(ctx.access, input.clientId);
      const result = await suppress({ organizationId: ctx.access.organizationId, ...input, source: 'MANUAL', createdById: ctx.session.userId });
      await recordAudit({ session: ctx.session, action: 'suppression.add', entityType: 'Suppression', entityId: result.entry.id, after: input });
      return { id: result.entry.id, affectedContacts: result.cancelledContacts };
    }),

  /**
   * Removal is permitted but always audited, and never for opt-outs,
   * bounces, complaints or do-not-call requests — those are the person's or
   * the provider's decision, not ours to overrule.
   */
  remove: permissionProcedure('suppression:write')
    .input(z.object({ id: z.string().uuid(), justification: z.string().min(5).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.db.suppression.findFirst({ where: { id: input.id, organizationId: ctx.access.organizationId } });
      if (!entry) return { ok: false, reason: 'Not found' };
      if (entry.clientId) clientFilter(ctx.access, entry.clientId);
      if ((PERMANENT as readonly string[]).includes(entry.reason)) {
        return { ok: false, reason: 'Opt-outs, bounces, complaints and do-not-call requests cannot be removed.' };
      }
      await releaseSuppression(entry);
      await recordAudit({ session: ctx.session, action: 'suppression.remove', entityType: 'Suppression', entityId: input.id, before: entry, after: { justification: input.justification } });
      return { ok: true };
    }),
});
