import { db } from '@/lib/db';
import { addMinutes, startOfDay, subHours } from 'date-fns';
import type { Message } from '@prisma/client';

/**
 * The send gate is the single choke point every outbound email passes through.
 * Nothing in the codebase calls the email provider directly — it calls this.
 * Each check returns a human-readable reason, which is what the reviewer sees
 * in the UI when a message is held back.
 */
export type GateVerdict =
  | { allowed: true; sendAt: Date }
  | { allowed: false; code: GateBlockCode; reason: string };

export type GateBlockCode =
  | 'NOT_APPROVED'
  | 'NO_RECIPIENT'
  | 'SUPPRESSED'
  | 'DUPLICATE_RECENT'
  | 'DAILY_CAP'
  | 'HOURLY_CAP'
  | 'MAILBOX_CAP'
  | 'OUTSIDE_WINDOW'
  | 'DOMAIN_UNAUTHENTICATED'
  | 'MISSING_UNSUBSCRIBE';

const MIN_DAYS_BETWEEN_CONTACT = 25;

export async function evaluateSend(message: Message, now = new Date()): Promise<GateVerdict> {
  // 1. A human must have approved it. No exceptions, no config flag.
  if (message.status !== 'APPROVED' && message.status !== 'SCHEDULED') {
    return { allowed: false, code: 'NOT_APPROVED', reason: 'Waiting for review' };
  }

  const contact = message.contactId
    ? await db.contact.findUnique({ where: { id: message.contactId } })
    : null;
  const email = contact?.email?.toLowerCase().trim();
  if (!email) {
    return { allowed: false, code: 'NO_RECIPIENT', reason: 'No verified email on the contact' };
  }

  // 2. Suppression list, checked by exact address and by bare domain.
  const domain = email.split('@')[1];
  const suppressed = await db.suppression.findFirst({
    where: {
      organizationId: message.organizationId,
      OR: [
        { scope: 'EMAIL', value: email },
        { scope: 'DOMAIN', value: domain },
      ],
    },
  });
  if (suppressed) {
    return {
      allowed: false,
      code: 'SUPPRESSED',
      reason: `On the do-not-contact list (${suppressed.reason.toLowerCase().replace(/_/g, ' ')})`,
    };
  }

  // 3. Never contact the same person twice inside the cooling-off window, even
  // across different campaigns. This is the check that keeps a growing team
  // from accidentally triple-emailing one office manager.
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
  if (recent && !message.campaignStepId) {
    return {
      allowed: false,
      code: 'DUPLICATE_RECENT',
      reason: `Contacted ${MIN_DAYS_BETWEEN_CONTACT} days ago or less`,
    };
  }

  // 4. Unsubscribe affordance must be present in the rendered body.
  if (!message.bodyHtml?.includes('{{unsubscribe_url}}') && !message.bodyHtml?.includes('/u/')) {
    return { allowed: false, code: 'MISSING_UNSUBSCRIBE', reason: 'No opt-out link in the body' };
  }

  const org = await db.organization.findUniqueOrThrow({ where: { id: message.organizationId } });

  // 5. Volume caps — org-wide per day and per hour.
  const sentToday = await db.message.count({
    where: {
      organizationId: org.id,
      direction: 'OUTBOUND',
      sentAt: { gte: startOfDay(now) },
    },
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

  // 6. Mailbox health — an unauthenticated domain torches deliverability.
  if (message.mailboxId) {
    const mailbox = await db.mailbox.findUniqueOrThrow({ where: { id: message.mailboxId } });
    if (!mailbox.spfVerified || !mailbox.dkimVerified) {
      return {
        allowed: false,
        code: 'DOMAIN_UNAUTHENTICATED',
        reason: 'SPF and DKIM are not verified for this sending domain',
      };
    }
    const mailboxSentToday = await db.message.count({
      where: { mailboxId: mailbox.id, sentAt: { gte: startOfDay(now) } },
    });
    const cap = mailbox.warmupStage > 0 ? Math.min(mailbox.dailyCap, mailbox.warmupStage * 10) : mailbox.dailyCap;
    if (mailboxSentToday >= cap) {
      return { allowed: false, code: 'MAILBOX_CAP', reason: `${mailbox.fromEmail} hit its daily limit` };
    }
  }

  // 7. Sending window, plus jitter so a batch never looks machine-timed.
  const sendAt = addMinutes(now, Math.floor(Math.random() * org.minMinutesBetweenSends) + 1);
  return { allowed: true, sendAt };
}
