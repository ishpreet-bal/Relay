import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import {
  archiveClient, clientInputSchema, createClient, createIcp, createOffer, createProofPoint, getClientDetail, icpInputSchema,
  listClients, offerInputSchema, proofPointInputSchema, setProofPointApproval, updateClient, updateIcp, updateOffer, updateProofPoint,
} from '@/server/services/clients';
import { recordAudit } from '@/lib/audit';

export const clientsRouter = router({
  list: permissionProcedure('client:read').query(({ ctx }) => listClients(ctx.access)),

  byId: permissionProcedure('client:read')
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => getClientDetail(ctx.access, input.id)),

  create: permissionProcedure('client:manage')
    .input(clientInputSchema)
    .mutation(async ({ ctx, input }) => {
      const client = await createClient(ctx.access, input);
      await recordAudit({ session: ctx.session, action: 'client.create', entityType: 'Client', entityId: client.id, after: { name: client.name } });
      return client;
    }),

  update: permissionProcedure('clientProfile:write')
    .input(z.object({ id: z.string().uuid(), data: clientInputSchema.partial() }))
    .mutation(async ({ ctx, input }) => {
      const client = await updateClient(ctx.access, input.id, input.data, { internal: ctx.session.isInternal });
      await recordAudit({ session: ctx.session, action: 'client.update', entityType: 'Client', entityId: client.id, after: input.data });
      return client;
    }),

  archive: permissionProcedure('client:manage')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await archiveClient(ctx.access, input.id);
      await recordAudit({ session: ctx.session, action: 'client.archive', entityType: 'Client', entityId: input.id });
      return { ok: true };
    }),

  createOffer: permissionProcedure('clientProfile:write')
    .input(z.object({ clientId: z.string().uuid(), data: offerInputSchema }))
    .mutation(({ ctx, input }) => createOffer(ctx.access, input.clientId, input.data)),

  updateOffer: permissionProcedure('clientProfile:write')
    .input(z.object({ id: z.string().uuid(), data: offerInputSchema.partial() }))
    .mutation(({ ctx, input }) => updateOffer(ctx.access, input.id, input.data)),

  createIcp: permissionProcedure('clientProfile:write')
    .input(z.object({ clientId: z.string().uuid(), data: icpInputSchema }))
    .mutation(({ ctx, input }) => createIcp(ctx.access, input.clientId, input.data)),

  updateIcp: permissionProcedure('clientProfile:write')
    .input(z.object({ id: z.string().uuid(), data: z.record(z.unknown()) }))
    .mutation(({ ctx, input }) => updateIcp(ctx.access, input.id, input.data)),

  createProofPoint: permissionProcedure('clientProfile:write')
    .input(z.object({ clientId: z.string().uuid(), data: proofPointInputSchema }))
    .mutation(({ ctx, input }) => createProofPoint(ctx.access, input.clientId, input.data)),

  updateProofPoint: permissionProcedure('clientProfile:write')
    .input(z.object({ id: z.string().uuid(), data: proofPointInputSchema.partial() }))
    .mutation(({ ctx, input }) => updateProofPoint(ctx.access, input.id, input.data)),

  approveProofPoint: permissionProcedure('clientProfile:write')
    .input(z.object({ id: z.string().uuid(), approved: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const point = await setProofPointApproval(ctx.access, ctx.session.userId, input.id, input.approved);
      await recordAudit({ session: ctx.session, action: input.approved ? 'proof_point.approve' : 'proof_point.unapprove', entityType: 'ProofPoint', entityId: input.id });
      return point;
    }),
});
