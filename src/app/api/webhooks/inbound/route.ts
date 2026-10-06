import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { verifyWebhook, SignatureError } from '@/server/services/webhook-verify';
import { recordReply } from '@/server/services/inbound';

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
 * Inbound replies from Resend. Verifies, dedupes and matches the reply to a
 * contact; services/inbound.ts decides what the reply means.
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

  // Match on the threading header first — provider message ids are globally
  // unique, so this can never cross tenants. The sender-address fallback
  // (replies from a colleague, or a client that strips threading headers) is
  // only attempted inside the organization that owns the receiving mailbox;
  // looking the sender up across every workspace would attach one tenant's
  // prospect reply to another tenant's record.
  const original = inReplyTo
    ? await db.message.findFirst({ where: { providerMessageId: stripBrackets(inReplyTo) } })
    : null;

  let contact = original?.contactId
    ? await db.contact.findUnique({ where: { id: original.contactId } })
    : null;

  if (!contact && fromAddress) {
    const organizationId = await organizationForRecipients(event.data.to ?? []);
    if (organizationId) {
      contact = await db.contact.findFirst({
        where: { organizationId, email: { equals: fromAddress, mode: 'insensitive' } },
      });
    }
  }

  if (!contact) {
    await db.webhookEvent.update({
      where: { provider_externalId: { provider: 'resend-inbound', externalId: verified.id } },
      data: { processedAt: new Date(), error: 'No matching contact' },
    });
    return Response.json({ ok: true, unmatched: true });
  }

  await recordReply({
    contact,
    original,
    subject: event.data.subject ?? null,
    body: event.data.text ?? stripHtml(event.data.html ?? ''),
    receivedAt: new Date(event.created_at),
    inReplyTo: inReplyTo ? stripBrackets(inReplyTo) : null,
  });

  await db.webhookEvent.update({
    where: { provider_externalId: { provider: 'resend-inbound', externalId: verified.id } },
    data: { processedAt: new Date() },
  });
  return Response.json({ ok: true });
}

/**
 * Resolves the workspace a reply was sent to from its recipient addresses.
 * Returns null when no mailbox matches or when the addresses point at more
 * than one workspace — an ambiguous reply is recorded unmatched rather than
 * guessed at.
 */
async function organizationForRecipients(to: string[]): Promise<string | null> {
  const addresses = to.map(extractAddress).filter((a): a is string => !!a);
  if (!addresses.length) return null;
  const mailboxes = await db.mailbox.findMany({
    where: { OR: [{ fromEmail: { in: addresses, mode: 'insensitive' } }, { replyToEmail: { in: addresses, mode: 'insensitive' } }] },
    select: { organizationId: true },
  });
  const orgs = new Set(mailboxes.map((m) => m.organizationId));
  return orgs.size === 1 ? [...orgs][0]! : null;
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
