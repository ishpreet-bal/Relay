import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { verifyWebhook, SignatureError } from '@/server/services/webhook-verify';
import { exitEnrollment } from '@/server/services/campaigns';
import { suppress } from '@/server/services/suppression';
import { logActivity } from '@/server/services/crm';

interface InboundEvent {
  type: string;
  created_at: string;
  data: {
    from?: string;
    to?: string[];
    subject?: string;
    text?: string;
    html?: string;
    headers?: Record<string, string>;
  };
}

/**
 * Inbound replies. This is the most important stop condition in the platform:
 * the moment a prospect answers, every queued follow-up for them must die. A
 * sequence that keeps nudging someone who already replied is worse than no
 * sequence at all.
 */
export async function POST(req: Request) {
  const raw = await req.text();

  let verified: { id: string; payload: InboundEvent };
  try {
    verified = verifyWebhook<InboundEvent>({
      body: raw,
      headers: await headers(),
      secret: env().RESEND_WEBHOOK_SECRET,
    });
  } catch (err) {
    if (err instanceof SignatureError) return new Response('Invalid signature', { status: 401 });
    throw err;
  }

  const event = verified.payload;
  const seen = await db.webhookEvent.findUnique({
    where: { provider_externalId: { provider: 'resend-inbound', externalId: verified.id } },
  });
  if (seen?.processedAt) return Response.json({ ok: true, deduped: true });

  await db.webhookEvent.upsert({
    where: { provider_externalId: { provider: 'resend-inbound', externalId: verified.id } },
    create: { provider: 'resend-inbound', externalId: verified.id, type: event.type, payload: event as never },
    update: {},
  });

  const fromAddress = extractAddress(event.data.from ?? '');
  const inReplyTo = event.data.headers?.['in-reply-to'] ?? event.data.headers?.['In-Reply-To'];

  // Match on the threading header first; fall back to the sender address, which
  // covers replies from a colleague on the same domain.
  const original = inReplyTo
    ? await db.message.findFirst({ where: { providerMessageId: stripBrackets(inReplyTo) } })
    : null;

  const contact = original
    ? await db.contact.findUnique({ where: { id: original.contactId ?? '' } })
    : fromAddress
      ? await db.contact.findFirst({ where: { email: fromAddress } })
      : null;

  if (!contact) {
    await db.webhookEvent.update({
      where: { provider_externalId: { provider: 'resend-inbound', externalId: verified.id } },
      data: { processedAt: new Date(), error: 'No matching contact' },
    });
    return Response.json({ ok: true, unmatched: true });
  }

  const organizationId = contact.organizationId;
  const body = event.data.text ?? stripHtml(event.data.html ?? '');

  await db.message.create({
    data: {
      organizationId,
      leadId: contact.leadId,
      contactId: contact.id,
      campaignId: original?.campaignId ?? null,
      direction: 'INBOUND',
      status: 'REPLIED',
      subject: event.data.subject ?? '(no subject)',
      bodyText: body,
      threadId: original?.threadId ?? original?.providerMessageId ?? null,
      inReplyTo: inReplyTo ? stripBrackets(inReplyTo) : null,
      sentAt: new Date(event.created_at),
    },
  });

  if (original) {
    await db.message.update({ where: { id: original.id }, data: { status: 'REPLIED' } });
  }

  await logActivity({
    organizationId,
    leadId: contact.leadId,
    type: 'EMAIL_RECEIVED',
    title: `Reply: ${event.data.subject ?? '(no subject)'}`,
    body,
    occurredAt: new Date(event.created_at),
  });

  // Stop every sequence for this lead before anything else can schedule.
  await exitEnrollment({ leadId: contact.leadId, reason: 'REPLIED', note: 'Prospect replied' });
  await db.lead.update({
    where: { id: contact.leadId },
    data: { status: 'ENGAGED', temperature: 'HOT' },
  });

  // An explicit opt-out in the reply body is honoured immediately, without
  // waiting for someone to read it.
  if (looksLikeOptOut(body) && contact.email) {
    await suppress({
      organizationId, value: contact.email, reason: 'DO_NOT_CONTACT',
      note: 'Requested no further contact in a reply',
    });
  }

  await db.webhookEvent.update({
    where: { provider_externalId: { provider: 'resend-inbound', externalId: verified.id } },
    data: { processedAt: new Date() },
  });
  return Response.json({ ok: true });
}

const OPT_OUT_PATTERNS = [
  /\bunsubscribe\b/i,
  /\b(stop|quit) (emailing|contacting|messaging) me\b/i,
  /\b(remove|take) me (from|off) (your )?(list|mailing)/i,
  /\bdo not (contact|email|reach out)/i,
  /\bnot interested\b.*\b(stop|remove|don'?t)\b/i,
  /\bplease stop\b/i,
];

function looksLikeOptOut(body: string) {
  // Only inspect the reply itself, not the quoted thread underneath — the
  // unsubscribe footer of our own email is quoted in nearly every reply.
  const own = body.split(/\n\s*(>|On .+ wrote:|-{2,}\s*Original Message)/)[0] ?? body;
  return OPT_OUT_PATTERNS.some((p) => p.test(own));
}

function extractAddress(from: string) {
  const match = from.match(/<([^>]+)>/);
  return (match?.[1] ?? from).toLowerCase().trim() || null;
}

function stripBrackets(value: string) {
  return value.replace(/^<|>$/g, '').trim();
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
