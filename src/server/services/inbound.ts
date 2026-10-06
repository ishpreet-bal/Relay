import type { Contact, Message } from '@prisma/client';
import { db } from '@/lib/db';
import { logActivity } from './activity';
import { advanceAccountStatus } from './accounts';
import { exitEnrollment } from './campaigns';
import { refreshCallTask } from './call-queue';
import { classifyReply, isOptOut, ownText } from './replies';
import { rescoreAccount } from './scoring';
import { suppress } from './suppression';

/**
 * A reply from a prospect, from any mail provider. This is the most important
 * stop condition in the platform: the moment someone answers, every queued
 * follow-up at their company must die — unless the "reply" is an
 * out-of-office notice, which says nothing about interest.
 *
 * A real reply also moves the contact up the call queue: a person who wrote
 * back is the best call a salesperson can make.
 */
export async function recordReply(params: {
  contact: Contact;
  original: Message | null;
  subject: string | null;
  body: string;
  receivedAt: Date;
  inReplyTo: string | null;
}) {
  const { contact, original } = params;
  const replyClass = classifyReply(params.subject, params.body);

  const message = await db.message.create({
    data: {
      organizationId: contact.organizationId,
      clientId: contact.clientId,
      accountId: contact.accountId,
      contactId: contact.id,
      campaignId: original?.campaignId ?? null,
      direction: 'INBOUND',
      status: 'REPLIED',
      subject: params.subject ?? '(no subject)',
      bodyText: params.body,
      threadId: original?.threadId ?? original?.providerMessageId ?? null,
      inReplyTo: params.inReplyTo,
      sentAt: params.receivedAt,
      replyClass,
      replyClassifiedAt: new Date(),
    },
  });

  if (original) await db.message.update({ where: { id: original.id }, data: { status: 'REPLIED' } });

  await logActivity({
    organizationId: contact.organizationId,
    clientId: contact.clientId,
    accountId: contact.accountId,
    contactId: contact.id,
    campaignId: original?.campaignId ?? null,
    type: 'EMAIL_RECEIVED',
    title: `Reply: ${params.subject ?? '(no subject)'}`,
    body: ownText(params.body).slice(0, 4000),
    metadata: { messageId: message.id, replyClass },
    occurredAt: params.receivedAt,
  });

  if (replyClass === 'OUT_OF_OFFICE') return { message, replyClass };

  // Stop every sequence at the account before anything else can schedule.
  await exitEnrollment({ accountId: contact.accountId, reason: 'REPLIED', note: 'Prospect replied' });
  await db.contact.update({ where: { id: contact.id }, data: { lastRepliedAt: params.receivedAt } });
  await db.account.update({ where: { id: contact.accountId }, data: { lastEngagedAt: params.receivedAt } });
  if (replyClass !== 'NEGATIVE' && replyClass !== 'UNSUBSCRIBE') {
    await advanceAccountStatus(contact.accountId, 'ENGAGED');
  }

  // An explicit opt-out is honoured immediately, without waiting for a
  // person to read it. Asking not to be contacted covers every channel.
  if (isOptOut(params.body) && contact.email) {
    await suppress({
      organizationId: contact.organizationId,
      value: contact.email,
      scope: 'EMAIL',
      channel: 'ALL',
      reason: 'DO_NOT_CONTACT',
      source: 'EMAIL_REPLY',
      contactId: contact.id,
      note: 'Asked not to be contacted, in a reply',
    });
  }

  await rescoreAccount(contact.accountId);
  await refreshCallTask(contact.id);
  return { message, replyClass };
}

/** A person corrects the automatic classification; the queue and score follow. */
export async function reclassifyReply(messageId: string, replyClass: Message['replyClass']) {
  const message = await db.message.update({
    where: { id: messageId },
    data: { replyClass, replyClassifiedAt: new Date() },
  });
  if (message.contactId) await refreshCallTask(message.contactId);
  await rescoreAccount(message.accountId);
  return message;
}
