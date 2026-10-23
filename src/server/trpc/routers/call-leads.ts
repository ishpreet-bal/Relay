import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import { recordAudit } from '@/lib/audit';
import { convertLead, convertLeadSchema, LEAD_STATUSES, leadListing, listCallLeads, logCallSchema, logLeadCall } from '@/server/services/call-leads';

const id = z.string().uuid();

/**
 * The no-website call list. Reading and looking up a listing follow call
 * access; logging a call needs call:log; turning a lead into an account
 * needs account:write.
 */
export const callLeadsRouter = router({
  list: permissionProcedure('call:read')
    .input(z.object({ clientId: id.nullish(), status: z.enum(LEAD_STATUSES).nullish(), cursor: id.nullish(), limit: z.number().int().min(1).max(100).default(50) }).default({}))
    .query(({ ctx, input }) => listCallLeads(ctx.access, input)),

  // A mutation, not a query: every lookup is a billed Google request, so it
  // happens only when a person asks for it.
  listing: permissionProcedure('call:read').input(z.object({ id })).mutation(({ ctx, input }) => leadListing(ctx.access, input.id)),

  logCall: permissionProcedure('call:log')
    .input(z.object({ id }).merge(logCallSchema))
    .mutation(({ ctx, input }) => {
      const { id: leadId, ...call } = input;
      return logLeadCall(ctx.access, ctx.session.userId, leadId, call);
    }),

  convert: permissionProcedure('account:write')
    .input(z.object({ id }).merge(convertLeadSchema))
    .mutation(async ({ ctx, input }) => {
      const { id: leadId, ...details } = input;
      const result = await convertLead(ctx.access, ctx.session.userId, leadId, details);
      await recordAudit({ session: ctx.session, action: 'call_lead.converted', entityType: 'Account', entityId: result.accountId, after: { leadId } });
      return result;
    }),
});
