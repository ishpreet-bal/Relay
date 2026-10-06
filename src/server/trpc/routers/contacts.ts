import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import {
  archiveContact, contactFilterSchema, contactInputSchema, countContacts, createContact, findContact,
  getContactDetail, listContacts, updateContact,
} from '@/server/services/contacts';
import { currentProvenance } from '@/server/services/provenance';
import { revealEmail } from '@/server/services/enrichment';
import { recordAudit } from '@/lib/audit';

export const contactsRouter = router({
  list: permissionProcedure('account:read')
    .input(contactFilterSchema)
    .query(({ ctx, input }) => listContacts(ctx.access, input)),

  count: permissionProcedure('account:read')
    .input(contactFilterSchema)
    .query(({ ctx, input }) => countContacts(ctx.access, input)),

  byId: permissionProcedure('account:read')
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => getContactDetail(ctx.access, input.id)),

  provenance: permissionProcedure('account:read')
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await findContact(ctx.access, input.id);
      return currentProvenance({ contactId: input.id });
    }),

  create: permissionProcedure('account:write')
    .input(z.object({ accountId: z.string().uuid(), data: contactInputSchema }))
    .mutation(async ({ ctx, input }) => {
      const result = await createContact(ctx.access, ctx.session.userId, input.accountId, input.data);
      if (!result.duplicate) {
        await recordAudit({ session: ctx.session, action: 'contact.create', entityType: 'Contact', entityId: result.contact.id });
      }
      return { id: result.contact.id, duplicate: result.duplicate };
    }),

  update: permissionProcedure('account:write')
    .input(z.object({ id: z.string().uuid(), data: contactInputSchema.partial() }))
    .mutation(async ({ ctx, input }) => {
      const { before, after } = await updateContact(ctx.access, ctx.session.userId, input.id, input.data);
      await recordAudit({ session: ctx.session, action: 'contact.update', entityType: 'Contact', entityId: input.id, before, after });
      return after;
    }),

  archive: permissionProcedure('account:write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await archiveContact(ctx.access, input.id);
      await recordAudit({ session: ctx.session, action: 'contact.archive', entityType: 'Contact', entityId: input.id });
      return { ok: true };
    }),

  revealEmail: permissionProcedure('account:write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => revealEmail(ctx.access, input.id)),
});
