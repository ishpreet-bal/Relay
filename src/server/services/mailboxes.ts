import { z } from 'zod';
import { db } from '@/lib/db';
import { chainFor } from '@/server/connectors/registry';
import { DomainError, NotConfiguredError, NotFoundError } from '@/server/errors';
import { gmailDomainStatus, publicMailbox } from './gmail';

/**
 * Sending mailboxes. A campaign cannot be activated until its mailbox's
 * domain passes SPF and DKIM, and that state comes from the sending
 * provider — never from a checkbox someone ticked.
 */

export const mailboxInputSchema = z.object({
  fromName: z.string().trim().min(1).max(120),
  fromEmail: z.string().trim().toLowerCase().email().max(254),
  replyToEmail: z.string().trim().toLowerCase().email().max(254).nullish().or(z.literal('').transform(() => null)),
  dailyCap: z.number().int().min(1).max(500).default(50),
});

export const mailboxUpdateSchema = mailboxInputSchema.pick({ fromName: true, replyToEmail: true, dailyCap: true }).partial().extend({
  isActive: z.boolean().optional(),
});

export async function listMailboxes(organizationId: string) {
  const rows = await db.mailbox.findMany({ where: { organizationId }, orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] });
  return rows.map(publicMailbox);
}

async function findMailbox(organizationId: string, id: string) {
  const mailbox = await db.mailbox.findFirst({ where: { id, organizationId } });
  if (!mailbox) throw new NotFoundError('Mailbox');
  return mailbox;
}

export async function createMailbox(organizationId: string, raw: z.input<typeof mailboxInputSchema>) {
  const input = mailboxInputSchema.parse(raw);
  const mailbox = await db.mailbox.create({ data: { ...input, organizationId } });
  // Check straight away when a provider is connected; a failed check is not
  // an error here, it is the state the operator needs to see.
  await checkMailboxDomain(organizationId, mailbox.id).catch(() => null);
  return publicMailbox(await findMailbox(organizationId, mailbox.id));
}

export async function updateMailbox(organizationId: string, id: string, raw: z.input<typeof mailboxUpdateSchema>) {
  await findMailbox(organizationId, id);
  const data = mailboxUpdateSchema.parse(raw);
  return publicMailbox(await db.mailbox.update({ where: { id }, data }));
}

export async function checkMailboxDomain(organizationId: string, id: string) {
  const mailbox = await findMailbox(organizationId, id);
  const domain = mailbox.fromEmail.split('@')[1]!;
  if (mailbox.provider === 'GMAIL') {
    // Google doesn't report a Workspace domain's authentication; DNS does.
    const status = await gmailDomainStatus(domain);
    await db.mailbox.update({ where: { id }, data: { spfVerified: status.spf, dkimVerified: status.dkim } });
    return { found: true, ...status };
  }
  const provider = (await chainFor(organizationId, 'EMAIL_SENDING')).find((p) => p.emailSending);
  if (!provider?.emailSending) throw new NotConfiguredError('EMAIL_SENDING', 'No email sending provider is connected.');
  if (!provider.emailSending.domainStatus) throw new DomainError(`${provider.name} can't report domain authentication.`);
  const status = await provider.emailSending.domainStatus(domain);
  await db.mailbox.update({ where: { id }, data: { spfVerified: status.spf, dkimVerified: status.dkim } });
  return status;
}
