import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import type { Role } from '@prisma/client';

/**
 * Clerk is the source of truth for identity; Postgres mirrors it so that joins,
 * ownership, and audit logs stay local. Every event is recorded in WebhookEvent
 * first, keyed by svix id, which makes redelivery a no-op.
 */
export async function POST(req: Request) {
  const payload = await req.text();
  const h = await headers();

  const svixId = h.get('svix-id');
  const svixTimestamp = h.get('svix-timestamp');
  const svixSignature = h.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing signature headers', { status: 400 });
  }

  // Clerk's webhook payload shape varies by event type; narrowing it per-event
  // in `handle` isn't worth a full typed union for a handler this small.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: { type: string; data: Record<string, any> };
  try {
    event = new Webhook(env().CLERK_WEBHOOK_SECRET).verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as typeof event;
  } catch {
    return new Response('Signature verification failed', { status: 401 });
  }

  const existing = await db.webhookEvent.findUnique({
    where: { provider_externalId: { provider: 'clerk', externalId: svixId } },
  });
  if (existing?.processedAt) return Response.json({ ok: true, deduped: true });

  await db.webhookEvent.upsert({
    where: { provider_externalId: { provider: 'clerk', externalId: svixId } },
    create: { provider: 'clerk', externalId: svixId, type: event.type, payload: event.data },
    update: { payload: event.data },
  });

  try {
    await handle(event);
    await db.webhookEvent.update({
      where: { provider_externalId: { provider: 'clerk', externalId: svixId } },
      data: { processedAt: new Date(), error: null },
    });
  } catch (err) {
    await db.webhookEvent.update({
      where: { provider_externalId: { provider: 'clerk', externalId: svixId } },
      data: { error: err instanceof Error ? err.message : 'unknown' },
    });
    // 500 asks Clerk to retry with backoff.
    return new Response('Processing failed', { status: 500 });
  }

  return Response.json({ ok: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handle(event: { type: string; data: Record<string, any> }) {
  const d = event.data;

  switch (event.type) {
    case 'user.created':
    case 'user.updated': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const email = d.email_addresses?.find((e: any) => e.id === d.primary_email_address_id)?.email_address
        ?? d.email_addresses?.[0]?.email_address;
      if (!email) throw new Error('User has no email address');
      await db.user.upsert({
        where: { clerkUserId: d.id },
        create: {
          clerkUserId: d.id, email,
          firstName: d.first_name ?? null, lastName: d.last_name ?? null,
          avatarUrl: d.image_url ?? null,
        },
        update: {
          email, firstName: d.first_name ?? null, lastName: d.last_name ?? null,
          avatarUrl: d.image_url ?? null,
        },
      });
      break;
    }

    case 'organization.created':
    case 'organization.updated': {
      await db.organization.upsert({
        where: { clerkOrgId: d.id },
        create: {
          clerkOrgId: d.id, name: d.name, slug: d.slug ?? d.id,
          brandName: d.name,
          trialEndsAt: new Date(Date.now() + 14 * 864e5),
        },
        update: { name: d.name, slug: d.slug ?? d.id },
      });
      break;
    }

    case 'organizationMembership.created':
    case 'organizationMembership.updated': {
      const org = await db.organization.findUnique({ where: { clerkOrgId: d.organization.id } });
      const user = await db.user.findUnique({ where: { clerkUserId: d.public_user_data.user_id } });
      if (!org || !user) throw new Error('Membership arrived before org or user');
      const role: Role = d.role === 'org:admin' ? 'ADMIN' : 'OPERATOR';
      await db.membership.upsert({
        where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
        create: { organizationId: org.id, userId: user.id, role },
        // Never silently demote an OWNER on a Clerk role sync.
        update: { role: role === 'ADMIN' ? undefined : role },
      });
      break;
    }

    case 'organizationMembership.deleted': {
      const org = await db.organization.findUnique({ where: { clerkOrgId: d.organization.id } });
      const user = await db.user.findUnique({ where: { clerkUserId: d.public_user_data.user_id } });
      if (org && user) {
        await db.membership.deleteMany({ where: { organizationId: org.id, userId: user.id } });
      }
      break;
    }

    case 'organization.deleted': {
      await db.organization.updateMany({
        where: { clerkOrgId: d.id },
        data: { deletedAt: new Date() },
      });
      break;
    }
  }
}
