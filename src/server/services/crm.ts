import { db } from '@/lib/db';
import type { ActivityType, Prisma } from '@prisma/client';

/**
 * The lead timeline is append-only and system-written. Every meaningful state
 * change in the platform lands here, which is what makes the CRM view a real
 * account history instead of a notes field.
 */
export async function logActivity(params: {
  organizationId: string;
  leadId: string;
  userId?: string | null;
  type: ActivityType;
  title: string;
  body?: string;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
  tx?: Prisma.TransactionClient;
}) {
  const client = params.tx ?? db;
  return client.activity.create({
    data: {
      organizationId: params.organizationId,
      leadId: params.leadId,
      userId: params.userId ?? null,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      metadata: params.metadata,
      occurredAt: params.occurredAt ?? new Date(),
    },
  });
}

export async function getTimeline(organizationId: string, leadId: string, take = 100) {
  return db.activity.findMany({
    where: { organizationId, leadId },
    orderBy: { occurredAt: 'desc' },
    take,
    include: { user: { select: { firstName: true, lastName: true, avatarUrl: true } } },
  });
}
