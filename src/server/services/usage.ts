import type { Prisma, UsageType } from '@prisma/client';
import { subDays } from 'date-fns';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { clientFilter, type AccessContext } from '@/server/access/scope';
import { currentJob } from '@/server/queues/context';

/**
 * Unit economics. Every external cost — model calls, enrichment lookups,
 * emails, phone minutes — becomes a UsageRecord attributed as precisely as the
 * caller knows (client, campaign, account, contact). Costs are stored in
 * thousandths of a cent so that sub-cent items like individual emails add up
 * correctly instead of rounding to zero.
 */

export interface UsageAttribution {
  clientId?: string | null;
  campaignId?: string | null;
  accountId?: string | null;
  contactId?: string | null;
}

export async function recordUsage(params: UsageAttribution & {
  organizationId: string;
  provider: string;
  type: UsageType;
  quantity?: number;
  costMillicents: number;
  aiRunId?: string;
  providerRecordId?: string;
  messageId?: string;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
  /** The cost is a list-price estimate, not what the provider reported. */
  isEstimate?: boolean;
  operation?: string;
  durationMs?: number;
  /** Defaults to the job this code is running inside. */
  jobId?: string | null;
}) {
  try {
    await db.usageRecord.create({
      data: {
        organizationId: params.organizationId,
        clientId: params.clientId ?? null,
        campaignId: params.campaignId ?? null,
        accountId: params.accountId ?? null,
        contactId: params.contactId ?? null,
        provider: params.provider,
        type: params.type,
        quantity: params.quantity ?? 1,
        costMillicents: Math.max(0, Math.round(params.costMillicents)),
        aiRunId: params.aiRunId ?? null,
        providerRecordId: params.providerRecordId ?? null,
        messageId: params.messageId ?? null,
        metadata: params.metadata,
        occurredAt: params.occurredAt ?? new Date(),
        isEstimate: params.isEstimate ?? false,
        operation: params.operation ?? null,
        durationMs: params.durationMs ?? null,
        jobId: params.jobId ?? currentJob()?.jobId ?? null,
      },
    });
  } catch (err) {
    // Cost accounting must never break the work it accounts for.
    logger.error('usage.record_failed', { provider: params.provider, type: params.type, error: err });
  }
}

export function millicentsToDollars(millicents: number) {
  return millicents / 100_000;
}

/** Cost summary for the admin cost view, optionally narrowed to one client. */
export async function costSummary(access: AccessContext, params: { clientId?: string | null; days?: number }) {
  const since = subDays(new Date(), params.days ?? 30);
  const where: Prisma.UsageRecordWhereInput = {
    organizationId: access.organizationId,
    occurredAt: { gte: since },
    ...(params.clientId ? { clientId: clientFilter(access, params.clientId).clientId as string } : {}),
  };
  const [byType, byProvider, byClient, total] = await Promise.all([
    db.usageRecord.groupBy({ by: ['type'], where, _sum: { costMillicents: true, quantity: true }, _count: true }),
    db.usageRecord.groupBy({ by: ['provider'], where, _sum: { costMillicents: true }, _count: true }),
    db.usageRecord.groupBy({ by: ['clientId'], where, _sum: { costMillicents: true } }),
    db.usageRecord.aggregate({ where, _sum: { costMillicents: true } }),
  ]);
  return {
    days: params.days ?? 30,
    totalMillicents: total._sum.costMillicents ?? 0,
    byType: byType.map((r) => ({ type: r.type, costMillicents: r._sum.costMillicents ?? 0, quantity: r._sum.quantity ?? 0, records: r._count })),
    byProvider: byProvider.map((r) => ({ provider: r.provider, costMillicents: r._sum.costMillicents ?? 0, records: r._count })),
    byClient: byClient.map((r) => ({ clientId: r.clientId, costMillicents: r._sum.costMillicents ?? 0 })),
  };
}
