import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, permissionProcedure } from '../init';
import { portalCampaigns, portalMeetings, portalOverview, portalSettings } from '@/server/services/portal';
import { clientProfileSchema, updateClient } from '@/server/services/clients';
import type { Session } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

/**
 * Client users always see their own client. Relay staff with portal access
 * can open any client's portal ("view as client") by passing its id; the
 * view is the same curated, read-only one the client sees.
 */
function portalClientId(session: Session, requested: string | null | undefined) {
  if (!session.isInternal) {
    if (!session.clientId) throw new TRPCError({ code: 'FORBIDDEN', message: 'Your account has not been connected to a client yet.' });
    return session.clientId;
  }
  if (!requested) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Choose a client to view.' });
  return requested;
}

const clientInput = z.object({ clientId: z.string().uuid().nullish() });

export const portalRouter = router({
  overview: permissionProcedure('portal:read')
    .input(clientInput.extend({ days: z.number().int().min(7).max(365).default(30) }))
    .query(({ ctx, input }) => portalOverview(ctx.access, portalClientId(ctx.session, input.clientId), input.days)),

  meetings: permissionProcedure('portal:read')
    .input(clientInput.extend({ range: z.enum(['upcoming', 'past', 'all']).default('all') }))
    .query(({ ctx, input }) => portalMeetings(ctx.access, portalClientId(ctx.session, input.clientId), input.range)),

  campaigns: permissionProcedure('portal:read')
    .input(clientInput)
    .query(({ ctx, input }) => portalCampaigns(ctx.access, portalClientId(ctx.session, input.clientId))),

  settings: permissionProcedure('portal:read')
    .input(clientInput)
    .query(({ ctx, input }) => portalSettings(ctx.access, portalClientId(ctx.session, input.clientId))),

  updateProfile: permissionProcedure('clientProfile:write')
    .input(clientInput.extend({ data: clientProfileSchema.partial() }))
    .mutation(async ({ ctx, input }) => {
      const clientId = portalClientId(ctx.session, input.clientId);
      const client = await updateClient(ctx.access, clientId, input.data, { internal: false });
      await recordAudit({ session: ctx.session, action: 'client.profile_update', entityType: 'Client', entityId: clientId, after: input.data });
      return { id: client.id };
    }),
});
