import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import {
  archiveContact, contactFilterSchema, contactInputSchema, countContacts, createContact, findContact,
  getContactDetail, listContacts, updateContact,
} from '@/server/services/contacts';
import { currentProvenance } from '@/server/services/provenance';
import { revealEmail, verifyContactEmail } from '@/server/services/enrichment';
import { recordAudit } from '@/lib/audit';
import { clientFilter } from '@/server/access/scope';

export const contactsRouter = router({
  businessLines: permissionProcedure('account:read')
    .input(z.object({ clientId: z.string().uuid().nullish(), cursor: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      // Discovery can find a company's switchboard before a named person.
      // Keep that usable route visible without fabricating a contact record.
      const rows = await ctx.db.account.findMany({
        where: { ...clientFilter(ctx.access, input.clientId), deletedAt: null, doNotContact: false, phone: { not: null } },
        orderBy: [{ score: 'desc' }, { id: 'asc' }], take: 51,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: { id: true, name: true, phone: true, city: true, industry: true },
      });
      const items = rows.slice(0, 50);
      return { items, nextCursor: rows.length > 50 ? items.at(-1)!.id : null };
    }),

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

  verifyEmail: permissionProcedure('account:write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => verifyContactEmail(ctx.access, input.id)),
});
