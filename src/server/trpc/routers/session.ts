import { router, protectedProcedure } from '../init';
import { ROLE_PERMISSIONS } from '@/lib/rbac';
import { isCapabilityAvailable } from '@/server/connectors/registry';

export const sessionRouter = router({
  me: protectedProcedure.query(({ ctx }) => ({
    userId: ctx.session.userId,
    name: ctx.session.name,
    email: ctx.session.email,
    role: ctx.session.role,
    isInternal: ctx.session.isInternal,
    clientId: ctx.session.clientId,
    permissions: [...ROLE_PERMISSIONS[ctx.session.role]],
  })),

  /** Clients the caller can switch between. */
  clients: protectedProcedure.query(({ ctx }) => {
    const ids = ctx.access.clients.kind === 'clients' ? ctx.access.clients.ids : null;
    return ctx.db.client.findMany({
      where: { organizationId: ctx.access.organizationId, archivedAt: null, kind: 'CUSTOMER', ...(ids ? { id: { in: [...ids] } } : {}) },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, status: true },
    });
  }),

  /**
   * Which kinds of provider are usable, as booleans only — so the UI can
   * offer "Find contacts" when a contact source is connected and say plainly
   * when it is not, without exposing which vendor or key is behind it.
   */
  capabilities: protectedProcedure.query(async ({ ctx }) => {
    const org = ctx.access.organizationId;
    const [companyData, contactData, emailFinder, emailSending, ai, emailVerification] = await Promise.all([
      isCapabilityAvailable(org, 'COMPANY_DATA'),
      isCapabilityAvailable(org, 'CONTACT_DATA'),
      isCapabilityAvailable(org, 'EMAIL_FINDER'),
      isCapabilityAvailable(org, 'EMAIL_SENDING'),
      isCapabilityAvailable(org, 'AI'),
      isCapabilityAvailable(org, 'EMAIL_VERIFICATION'),
    ]);
    return { companyData, contactData, emailFinder, emailSending, ai, emailVerification };
  }),
});
