import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { NotConfiguredError } from '@/server/errors';
import { chainFor } from '@/server/connectors/registry';
import { evaluateSend, type GateVerdict } from './send-gate';
import { issueUnsubscribeToken, unsubscribeUrl, oneClickUnsubscribeUrl } from './unsubscribe';
import { logActivity } from './activity';
import { advanceAccountStatus } from './accounts';
import { recordUsage } from './usage';
import { sendViaGmail } from './gmail';
import type { OutboundEmail } from '@/server/connectors/types';

export interface SendOutcome {
  sent: boolean;
  messageId: string;
  verdict: GateVerdict;
  providerMessageId?: string;
}

/**
 * The only function in the platform that puts mail on the wire. Every path in —
 * manual approve-and-send, campaign worker, follow-up — ends up here, and here
 * always calls the gate first. There is no bypass parameter by design.
 */
export async function sendMessage(messageId: string): Promise<SendOutcome> {
  const message = await db.message.findUniqueOrThrow({ where: { id: messageId } });

  const verdict = await evaluateSend(message);
  if (!verdict.allowed) {
    await db.message.update({ where: { id: messageId }, data: { failureReason: verdict.reason } });
    return { sent: false, messageId, verdict };
  }

  const contact = await db.contact.findUniqueOrThrow({ where: { id: message.contactId! } });
  const mailbox = message.mailboxId
    ? await db.mailbox.findUniqueOrThrow({ where: { id: message.mailboxId } })
    : await db.mailbox.findFirstOrThrow({ where: { organizationId: message.organizationId, isActive: true } });
  // A Gmail mailbox sends through its own Google account; others through the sending provider.
  const provider = mailbox.provider === 'GMAIL'
    ? { id: 'gmail', emailSending: { send: (email: OutboundEmail) => sendViaGmail(mailbox, email) } }
    : (await chainFor(message.organizationId, 'EMAIL_SENDING')).find((p) => p.emailSending);
  if (!provider?.emailSending) throw new NotConfiguredError('EMAIL_SENDING', 'No email sending provider is connected.');

  const token = await issueUnsubscribeToken(message.organizationId, contact.email!);
  const url = unsubscribeUrl(token);
  const oneClickUrl = oneClickUnsubscribeUrl(token);

  const html = (message.bodyHtml ?? '').replaceAll('{{unsubscribe_url}}', url);
  const text = `${message.bodyText ?? ''}\n\n---\nUnsubscribe: ${url}`;

  await db.message.update({ where: { id: messageId }, data: { status: 'SENDING' } });

  try {
    const result = await provider.emailSending.send({
      from: `${mailbox.fromName} <${mailbox.fromEmail}>`,
      to: contact.email!,
      replyTo: mailbox.replyToEmail ?? mailbox.fromEmail,
      subject: message.subject ?? '',
      html,
      text,
      headers: {
        // RFC 8058 one-click unsubscribe. Mailbox providers weight this heavily
        // for inbox placement, and it gives the recipient the least-friction
        // exit available.
        'List-Unsubscribe': `<${oneClickUrl}>, <mailto:${mailbox.replyToEmail ?? mailbox.fromEmail}?subject=unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        ...(message.inReplyTo ? { 'In-Reply-To': message.inReplyTo, References: message.inReplyTo } : {}),
      },
    });

    const sentAt = new Date();
    const [account] = await db.$transaction([
      db.account.findUniqueOrThrow({ where: { id: message.accountId }, select: { score: true } }),
      db.message.update({
        where: { id: messageId },
        data: {
          status: 'SENT',
          sentAt,
          providerMessageId: result.providerMessageId,
          mailboxId: mailbox.id,
          failureReason: null,
          // Captured at the moment of sending so outcomes can later be
          // compared with what Relay believed when it acted.
          contactScoreAtSend: contact.score,
        },
      }),
      db.contact.update({ where: { id: contact.id }, data: { lastContactedAt: sentAt } }),
      db.account.update({ where: { id: message.accountId }, data: { lastContactedAt: sentAt } }),
    ]);
    await db.message.update({ where: { id: messageId }, data: { accountScoreAtSend: account.score } });
    await advanceAccountStatus(message.accountId, 'ACTIVE_OUTREACH');

    await recordUsage({
      organizationId: message.organizationId,
      clientId: message.clientId, campaignId: message.campaignId, accountId: message.accountId, contactId: contact.id,
      provider: provider.id, type: 'EMAIL_SENT', costMillicents: result.costMillicents, messageId,
    });
    await logActivity({
      organizationId: message.organizationId,
      clientId: message.clientId,
      accountId: message.accountId,
      contactId: contact.id,
      campaignId: message.campaignId,
      type: 'EMAIL_SENT',
      title: message.subject ?? 'Email sent',
      body: message.bodyText ?? undefined,
      metadata: { messageId, to: contact.email, approvalSource: message.approvalSource },
      occurredAt: sentAt,
    });

    return { sent: true, messageId, verdict, providerMessageId: result.providerMessageId ?? undefined };
  } catch (err) {
    logger.error('email.send_failed', { messageId, error: err });
    await db.message.update({
      where: { id: messageId },
      data: { status: 'FAILED', failureReason: err instanceof Error ? err.message.slice(0, 300) : 'Send failed' },
    });
    throw err;
  }
}

/** Dry-run the gate without sending — powers the review queue's status column. */
export async function previewGate(messageId: string) {
  const message = await db.message.findUniqueOrThrow({ where: { id: messageId } });
  return evaluateSend(message);
}
