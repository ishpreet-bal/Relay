import { router, permissionProcedure } from '../init';
import { inviteMember, inviteSchema, listMembers, memberUpdateSchema, updateMember } from '@/server/services/team';
import { recordAudit } from '@/lib/audit';

export const teamRouter = router({
  members: permissionProcedure('member:manage').query(({ ctx }) => listMembers(ctx.access.organizationId)),

  update: permissionProcedure('member:manage')
    .input(memberUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      const membership = await updateMember(ctx.access, { userId: ctx.session.userId, role: ctx.session.role }, input);
      await recordAudit({ session: ctx.session, action: 'member.update', entityType: 'Membership', entityId: membership.id, after: input });
      return membership;
    }),

  invite: permissionProcedure('member:manage')
    .input(inviteSchema)
    .mutation(async ({ ctx, input }) => {
      const invitation = await inviteMember(ctx.access, ctx.session.clerkUserId, input);
      await recordAudit({ session: ctx.session, action: 'member.invite', entityType: 'Membership', after: { email: input.email, role: input.role, clientId: input.clientId ?? null, clientIds: invitation.clientIds } });
      return invitation;
    }),
});
