import { z } from 'zod';
import { router, permissionProcedure } from '../init';
import { checkMailboxDomain, createMailbox, listMailboxes, mailboxInputSchema, mailboxUpdateSchema, updateMailbox } from '@/server/services/mailboxes';
import { recordAudit } from '@/lib/audit';
import { disconnectGmail, googleConfigured } from '@/server/services/gmail';

export const mailboxesRouter = router({
  list: permissionProcedure('settings:read').query(({ ctx }) => listMailboxes(ctx.access.organizationId)),

  create: permissionProcedure('settings:write')
    .input(mailboxInputSchema)
    .mutation(async ({ ctx, input }) => {
      const mailbox = await createMailbox(ctx.access.organizationId, input);
      await recordAudit({ session: ctx.session, action: 'mailbox.create', entityType: 'Mailbox', entityId: mailbox.id, after: { fromEmail: mailbox.fromEmail } });
      return mailbox;
    }),

  update: permissionProcedure('settings:write')
    .input(z.object({ id: z.string().uuid(), data: mailboxUpdateSchema }))
    .mutation(async ({ ctx, input }) => {
      const mailbox = await updateMailbox(ctx.access.organizationId, input.id, input.data);
      await recordAudit({ session: ctx.session, action: 'mailbox.update', entityType: 'Mailbox', entityId: input.id, after: input.data });
      return mailbox;
    }),

  checkDomain: permissionProcedure('settings:write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => checkMailboxDomain(ctx.access.organizationId, input.id)),

  /** Whether Gmail mailboxes can be connected (the Google OAuth client is configured). */
  gmailAvailable: permissionProcedure('settings:read').query(() => googleConfigured()),

  disconnectGmail: permissionProcedure('settings:write')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await disconnectGmail(ctx.access.organizationId, input.id);
      await recordAudit({ session: ctx.session, action: 'mailbox.gmail_disconnected', entityType: 'Mailbox', entityId: input.id });
      return { ok: true };
    }),
});
