import { Resend } from 'resend';
import { db } from '@/lib/db';
import { requireEnv } from '@/lib/env';
import { evaluateSend, type GateVerdict } from './send-gate';
import { issueUnsubscribeToken, unsubscribeUrl } from './unsubscribe';
import { logActivity } from './crm';

let resendClient: Resend | null = null;
function resend() {
  resendClient ??= new Resend(requireEnv('RESEND_API_KEY', 'Email sending'));
  return resendClient;
}

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
    await db.message.update({
      where: { id: messageId },
      data: { failureReason: verdict.reason },
    });
    return { sent: false, messageId, verdict };
  }

  const contact = await db.contact.findUniqueOrThrow({ where: { id: message.contactId! } });
  const mailbox = message.mailboxId
    ? await db.mailbox.findUniqueOrThrow({ where: { id: message.mailboxId } })
    : await db.mailbox.findFirstOrThrow({
        where: { organizationId: message.organizationId, isActive: true },
      });

  const token = await issueUnsubscribeToken(message.organizationId, contact.email!);
  const url = unsubscribeUrl(token);

  const html = (message.bodyHtml ?? '').replaceAll('{{unsubscribe_url}}', url);
  const text = `${message.bodyText ?? ''}\n\n---\nUnsubscribe: ${url}`;

  await db.message.update({ where: { id: messageId }, data: { status: 'SENDING' } });

  try {
    const result = await resend().emails.send({
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
        'List-Unsubscribe': `<${url}>, <mailto:${mailbox.replyToEmail ?? mailbox.fromEmail}?subject=unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        ...(message.inReplyTo ? { 'In-Reply-To': message.inReplyTo, References: message.inReplyTo } : {}),
      },
    });

    if (result.error) throw new Error(result.error.message);

    const sentAt = new Date();
    await db.$transaction([
      db.message.update({
        where: { id: messageId },
        data: {
          status: 'SENT',
          sentAt,
          providerMessageId: result.data?.id ?? null,
          mailboxId: mailbox.id,
          failureReason: null,
        },
      }),
      db.lead.update({
        where: { id: message.leadId },
        data: { lastContactedAt: sentAt, status: 'CONTACTED' },
      }),
    ]);

    await logActivity({
      organizationId: message.organizationId,
      leadId: message.leadId,
      type: 'EMAIL_SENT',
      title: message.subject ?? 'Email sent',
      body: message.bodyText ?? undefined,
      metadata: { messageId, to: contact.email },
      occurredAt: sentAt,
    });

    return { sent: true, messageId, verdict, providerMessageId: result.data?.id };
  } catch (err) {
    await db.message.update({
      where: { id: messageId },
      data: {
        status: 'FAILED',
        failureReason: err instanceof Error ? err.message.slice(0, 300) : 'Send failed',
      },
    });
    throw err;
  }
}

/** Dry-run the gate without sending — powers the review queue's status column. */
export async function previewGate(messageId: string) {
  const message = await db.message.findUniqueOrThrow({ where: { id: messageId } });
  return evaluateSend(message);
}
