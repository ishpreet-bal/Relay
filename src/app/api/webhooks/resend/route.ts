import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { verifyWebhook, SignatureError } from '@/server/services/webhook-verify';
import { env } from '@/lib/env';
import { suppress } from '@/server/services/suppression';
import { logActivity } from '@/server/services/activity';
import { exitEnrollment } from '@/server/services/campaigns';
import { refreshCallTask } from '@/server/services/call-queue';
import { setFieldEvidence } from '@/server/services/provenance';

/**
 * Delivery telemetry. Two events here are not analytics but compliance
 * obligations: a hard bounce and a spam complaint both write straight to the
 * suppression list, which cancels anything queued for that address. Continuing
 * to mail an address that bounced or complained is how a sending domain dies.
 */
interface ResendEvent {
  type: string;
  created_at: string;
  data: { email_id?: string; to?: string[]; bounce?: { type?: string }; click?: { link?: string } };
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = env().RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response('Email webhooks are not configured', { status: 503 });

  let verified: { id: string; payload: ResendEvent };
  try {
    verified = verifyWebhook<ResendEvent>({
      body: raw,
      headers: await headers(),
      secret,
    });
  } catch (err) {
    // 401 and nothing else. No parsing, no logging of the body, no partial
    // processing — an unverified payload is treated as hostile.
    if (err instanceof SignatureError) return new Response('Invalid signature', { status: 401 });
    throw err;
  }

  const event = verified.payload;
  // Svix guarantees a unique message id per delivery, which is a better
  // idempotency key than anything we could derive from the payload.
  const externalId = verified.id;
  const seen = await db.webhookEvent.findUnique({
    where: { provider_externalId: { provider: 'resend', externalId } },
  });
  if (seen?.processedAt) return Response.json({ ok: true, deduped: true });

  await db.webhookEvent.upsert({
    where: { provider_externalId: { provider: 'resend', externalId } },
    create: { provider: 'resend', externalId, type: event.type, payload: event as never },
    update: {},
  });

  const message = event.data.email_id
    ? await db.message.findUnique({ where: { providerMessageId: event.data.email_id } })
    : null;

  // An event for a message we don't recognize is recorded and dropped, not an
  // error — it may be from a different environment sharing the webhook.
  if (!message) {
    await db.webhookEvent.update({
      where: { provider_externalId: { provider: 'resend', externalId } },
      data: { processedAt: new Date(), error: 'No matching message' },
    });
    return Response.json({ ok: true, unmatched: true });
  }

  const occurredAt = new Date(event.created_at);
  await db.messageEvent.create({
    data: { messageId: message.id, type: event.type.replace('email.', ''), payload: event.data as never, occurredAt },
  });

  switch (event.type) {
    case 'email.delivered':
      await advance(message.id, 'DELIVERED', occurredAt);
      break;

    case 'email.opened':
      await db.message.update({
        where: { id: message.id },
        data: {
          openCount: { increment: 1 },
          firstOpenedAt: message.firstOpenedAt ?? occurredAt,
          ...(rank(message.status) < rank('OPENED') ? { status: 'OPENED' as const } : {}),
        },
      });
      // Opens are weak evidence, but repeated opens still nudge the queue.
      if (message.contactId && message.openCount >= 1) await refreshCallTask(message.contactId);
      break;

    case 'email.clicked':
      await db.message.update({
        where: { id: message.id },
        data: {
          clickCount: { increment: 1 },
          ...(rank(message.status) < rank('CLICKED') ? { status: 'CLICKED' as const } : {}),
        },
      });
      await db.account.update({ where: { id: message.accountId }, data: { lastEngagedAt: occurredAt } });
      await logActivity({
        organizationId: message.organizationId, clientId: message.clientId, accountId: message.accountId,
        contactId: message.contactId, campaignId: message.campaignId, type: 'EMAIL_RECEIVED',
        title: 'Clicked a link', body: event.data.click?.link, occurredAt,
      });
      if (message.contactId) await refreshCallTask(message.contactId);
      break;

    case 'email.bounced': {
      const hard = (event.data.bounce?.type ?? '').toLowerCase().includes('hard')
        || (event.data.bounce?.type ?? '').toLowerCase() === 'permanent';
      await db.message.update({
        where: { id: message.id },
        data: { status: 'BOUNCED', bounceType: event.data.bounce?.type ?? 'unknown' },
      });
      const address = event.data.to?.[0];
      // Soft bounces are transient (full mailbox, greylisting) and do not earn
      // a permanent suppression.
      if (hard && address) {
        await suppress({
          organizationId: message.organizationId, value: address, scope: 'EMAIL', channel: 'EMAIL',
          reason: 'HARD_BOUNCE', source: 'BOUNCE_WEBHOOK', contactId: message.contactId,
          campaignId: message.campaignId, note: `Bounced on ${occurredAt.toISOString()}`,
        });
        if (message.contactId) {
          await setFieldEvidence({ contactId: message.contactId }, 'email', 'REJECTED');
          await exitEnrollment({ contactId: message.contactId, reason: 'BOUNCED', note: 'Hard bounce' });
        }
      }
      break;
    }

    case 'email.complained': {
      await db.message.update({ where: { id: message.id }, data: { status: 'COMPLAINED' } });
      const address = event.data.to?.[0];
      if (address) {
        await suppress({
          organizationId: message.organizationId, value: address, scope: 'EMAIL', channel: 'EMAIL',
          reason: 'SPAM_COMPLAINT', source: 'COMPLAINT_WEBHOOK', contactId: message.contactId,
          campaignId: message.campaignId, note: 'Marked as spam by the recipient',
        });
      }
      break;
    }
  }

  await db.webhookEvent.update({
    where: { provider_externalId: { provider: 'resend', externalId } },
    data: { processedAt: new Date() },
  });
  return Response.json({ ok: true });
}

/** Message status is a ladder; a late-arriving 'delivered' must not clobber 'replied'. */
const ORDER = ['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED'] as const;
function rank(status: string) {
  const i = ORDER.indexOf(status as (typeof ORDER)[number]);
  return i === -1 ? -1 : i;
}

async function advance(messageId: string, status: 'DELIVERED', at: Date) {
  const current = await db.message.findUniqueOrThrow({ where: { id: messageId }, select: { status: true } });
  if (rank(current.status) >= rank(status)) return;
  await db.message.update({ where: { id: messageId }, data: { status } });
  void at;
}
