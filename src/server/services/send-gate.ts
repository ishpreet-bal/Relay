import { db } from '@/lib/db';
import { addMinutes, startOfDay, subHours } from 'date-fns';
import type { Message } from '@prisma/client';
import { outreachContactBlock } from './outreach-readiness';
import { briefFacts, recommendWorkflows } from './service-brief';
import { findSuppression } from './suppression';

/**
 * The send gate is the single choke point every outbound email passes through.
 * Nothing in the codebase calls the email provider directly — it calls this.
 * Each check returns a human-readable reason, which is what the reviewer sees
 * in the UI when a message is held back.
 *
 * Approval can now come from a person or from policy (a fully verified draft
 * in a campaign that allows it). Either way, every check below still runs.
 */
export type GateVerdict =
  | { allowed: true; sendAt: Date }
  | { allowed: false; code: GateBlockCode; reason: string };

export type GateBlockCode =
  | 'NOT_APPROVED'
  | 'CONTACT_SCOPE'
  | 'EMAIL_UNVERIFIED'
  | 'CONSENT_REQUIRED'
  | 'RESEARCH_REQUIRED'
  | 'OFFER_REQUIRED'
  | 'UNVERIFIED_CLAIMS'
  | 'NO_RECIPIENT'
  | 'SUPPRESSED'
  | 'DUPLICATE_RECENT'
  | 'DAILY_CAP'
  | 'HOURLY_CAP'
  | 'MAILBOX_CAP'
  | 'OUTSIDE_WINDOW'
  | 'DOMAIN_UNAUTHENTICATED'
  | 'MISSING_UNSUBSCRIBE'
  | 'MISSING_SENDER_IDENTITY';

const MIN_DAYS_BETWEEN_CONTACT = 25;

export async function evaluateSend(message: Message, now = new Date()): Promise<GateVerdict> {
  // 1. Approved, by a person or by policy.
  if (message.status !== 'APPROVED' && message.status !== 'SCHEDULED') {
    return { allowed: false, code: 'NOT_APPROVED', reason: 'Waiting for review' };
  }

  if (message.approvalSource !== 'HUMAN') return { allowed: false, code: 'NOT_APPROVED', reason: 'A person must approve every outreach message' };

  // 2. A draft with unsupported or contradicted claims only leaves if a person
  // approved it and took responsibility for the wording. Policy never can.
  if ((message.verificationStatus === 'BLOCKED' || message.verificationStatus === 'UNSUPPORTED') && message.approvalSource !== 'HUMAN') {
    return { allowed: false, code: 'UNVERIFIED_CLAIMS', reason: 'Contains claims that could not be verified' };
  }

  const contact = message.contactId
    ? await db.contact.findUnique({
        where: { id: message.contactId },
        include: { account: { select: { doNotContact: true, domain: true, deletedAt: true } } },
      })
    : null;
  const email = contact?.email?.toLowerCase().trim();
  if (!contact || !email || contact.deletedAt || contact.account.deletedAt) {
    return { allowed: false, code: 'NO_RECIPIENT', reason: 'No email address on the contact' };
  }

  const readinessBlock = outreachContactBlock(contact, message, now);
  if (readinessBlock) return { allowed: false, ...readinessBlock };

  // Marketing campaign outreach requires current business research and a
  // specific offer. Direct replies to inbound inquiries do not require a crawl.
  if (message.campaignId) {
    const research = await db.research.findUnique({ where: { accountId: contact.accountId } });
    const facts = briefFacts(research?.facts);
    if (research?.status !== 'COMPLETED' || !research.refreshedAt || now.getTime() - research.refreshedAt.getTime() > 30 * 86400_000 || !facts.length) {
      return { allowed: false, code: 'RESEARCH_REQUIRED', reason: 'Campaign outreach needs current research with sourced business facts' };
    }
    const client = await db.client.findUnique({ where: { id: message.clientId }, select: { kind: true, offers: { where: { isActive: true }, select: { name: true } } } });
    const angles = (research.relevance as { angles?: Array<{ offer?: string | null }> } | null)?.angles ?? [];
    const hasOffer = client?.kind === 'INTERNAL' ? recommendWorkflows(facts).length > 0 : client?.offers.some((o) => angles.some((a) => a.offer === o.name));
    if (!hasOffer) return { allowed: false, code: 'OFFER_REQUIRED', reason: 'Choose a specific offer supported by this account’s research before campaign outreach' };
  }

  // 3. Do-not-contact, on the person, the account, or the suppression list
  // (by address and by domain, workspace-wide or for this client).
  if (contact.doNotEmail || contact.account.doNotContact) {
    return { allowed: false, code: 'SUPPRESSED', reason: 'Marked do-not-email' };
  }
  const suppressed = await findSuppression({
    organizationId: message.organizationId, clientId: message.clientId, channel: 'EMAIL', email,
  });
  if (suppressed) {
    return {
      allowed: false,
      code: 'SUPPRESSED',
      reason: `On the do-not-contact list (${suppressed.reason.toLowerCase().replace(/_/g, ' ')})`,
    };
  }

  // 4. Never contact the same person twice inside the cooling-off window
  // outside of their sequence — across campaigns and across clients.
  const recent = await db.message.findFirst({
    where: {
      organizationId: message.organizationId,
      contactId: message.contactId,
      direction: 'OUTBOUND',
      id: { not: message.id },
      sentAt: { gte: subHours(now, MIN_DAYS_BETWEEN_CONTACT * 24) },
    },
    orderBy: { sentAt: 'desc' },
  });
  if (recent && !(message.campaignStepId && recent.campaignId === message.campaignId)) {
    return {
      allowed: false,
      code: 'DUPLICATE_RECENT',
      reason: `Contacted in the last ${MIN_DAYS_BETWEEN_CONTACT} days`,
    };
  }

  // 5. Unsubscribe affordance must be present in the rendered body.
  if (!message.bodyHtml?.includes('{{unsubscribe_url}}') && !message.bodyHtml?.includes('/u/')) {
    return { allowed: false, code: 'MISSING_UNSUBSCRIBE', reason: 'No opt-out link in the body' };
  }

  // 6. Sender identification (CASL): every email carries the sender's mailing address.
  const client = await db.client.findUnique({ where: { id: message.clientId }, select: { name: true, mailingAddress: true } });
  if (!client?.mailingAddress?.trim()) {
    return {
      allowed: false, code: 'MISSING_SENDER_IDENTITY',
      reason: `No mailing address for ${client?.name ?? 'this client'}. Add one to the client's profile: Canada's anti-spam law requires it in every email.`,
    };
  }

  const org = await db.organization.findUniqueOrThrow({ where: { id: message.organizationId } });

  // 7. Volume caps — workspace-wide per day and per hour.
  const sentToday = await db.message.count({
    where: { organizationId: org.id, direction: 'OUTBOUND', sentAt: { gte: startOfDay(now) } },
  });
  if (sentToday >= org.dailySendCap) {
    return { allowed: false, code: 'DAILY_CAP', reason: `Daily limit of ${org.dailySendCap} reached` };
  }
  const sentLastHour = await db.message.count({
    where: { organizationId: org.id, direction: 'OUTBOUND', sentAt: { gte: subHours(now, 1) } },
  });
  if (sentLastHour >= org.hourlySendCap) {
    return { allowed: false, code: 'HOURLY_CAP', reason: `Hourly limit of ${org.hourlySendCap} reached` };
  }

  // 8. Mailbox health — an unauthenticated domain torches deliverability.
  if (message.mailboxId) {
    const mailbox = await db.mailbox.findUniqueOrThrow({ where: { id: message.mailboxId } });
    if (!mailbox.spfVerified || !mailbox.dkimVerified) {
      return { allowed: false, code: 'DOMAIN_UNAUTHENTICATED', reason: 'SPF and DKIM are not verified for this sending domain' };
    }
    const mailboxSentToday = await db.message.count({
      where: { mailboxId: mailbox.id, sentAt: { gte: startOfDay(now) } },
    });
    const cap = mailbox.warmupStage > 0 ? Math.min(mailbox.dailyCap, mailbox.warmupStage * 10) : mailbox.dailyCap;
    if (mailboxSentToday >= cap) {
      return { allowed: false, code: 'MAILBOX_CAP', reason: `${mailbox.fromEmail} hit its daily limit` };
    }
  }

  // 9. Jitter, so a batch never looks machine-timed.
  const sendAt = addMinutes(now, Math.floor(Math.random() * org.minMinutesBetweenSends) + 1);
  return { allowed: true, sendAt };
}
