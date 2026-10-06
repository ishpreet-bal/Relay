import { db } from '@/lib/db';
import type { ActivityType, Prisma } from '@prisma/client';
import { clientFilter, type AccessContext } from '@/server/access/scope';

/**
 * The account timeline is append-only and system-written. Every meaningful
 * state change lands here — emails, replies, calls, meetings, signals, status
 * changes — which is what makes an account page a real history instead of a
 * notes field.
 */
export async function logActivity(params: {
  organizationId: string;
  accountId: string;
  /** Resolved from the account when omitted. */
  clientId?: string;
  contactId?: string | null;
  campaignId?: string | null;
  userId?: string | null;
  type: ActivityType;
  title: string;
  body?: string | null;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
  tx?: Prisma.TransactionClient;
}) {
  const client = params.tx ?? db;
  const clientId = params.clientId
    ?? (await client.account.findUniqueOrThrow({ where: { id: params.accountId }, select: { clientId: true } })).clientId;

  return client.activity.create({
    data: {
      organizationId: params.organizationId,
      clientId,
      accountId: params.accountId,
      contactId: params.contactId ?? null,
      campaignId: params.campaignId ?? null,
      userId: params.userId ?? null,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      metadata: params.metadata,
      occurredAt: params.occurredAt ?? new Date(),
    },
  });
}

export async function getTimeline(access: AccessContext, params: { accountId?: string; contactId?: string; take?: number }) {
  return db.activity.findMany({
    where: {
      ...clientFilter(access),
      ...(params.accountId ? { accountId: params.accountId } : {}),
      ...(params.contactId ? { contactId: params.contactId } : {}),
    },
    orderBy: { occurredAt: 'desc' },
    take: params.take ?? 100,
    include: {
      user: { select: { firstName: true, lastName: true, avatarUrl: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}
