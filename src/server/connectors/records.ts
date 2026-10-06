import type { Prisma, ProviderRecordStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Every request to an external data source is recorded: which provider, what
 * was asked, what came back, what it cost. The same table is the cache that
 * stops Relay paying twice for one lookup — see findCachedRecord.
 */

export interface ProviderCall {
  organizationId: string;
  clientId?: string | null;
  accountId?: string | null;
  contactId?: string | null;
  provider: string;
  operation: string;
  lookupKey: string;
  status: ProviderRecordStatus;
  externalId?: string | null;
  request?: Prisma.InputJsonValue;
  response?: Prisma.InputJsonValue;
  normalized?: Prisma.InputJsonValue;
  confidence?: number | null;
  costMillicents?: number;
  error?: string | null;
  /** How long the result may be reused. */
  ttlDays?: number;
}

export function normalizeLookupKey(key: string) {
  return key.trim().toLowerCase();
}

export async function recordProviderCall(call: ProviderCall) {
  try {
    return await db.providerRecord.create({
      data: {
        organizationId: call.organizationId,
        clientId: call.clientId ?? null,
        accountId: call.accountId ?? null,
        contactId: call.contactId ?? null,
        provider: call.provider,
        operation: call.operation,
        lookupKey: normalizeLookupKey(call.lookupKey),
        status: call.status,
        externalId: call.externalId ?? null,
        request: call.request,
        response: call.response,
        normalized: call.normalized,
        confidence: call.confidence ?? null,
        costMillicents: call.costMillicents ?? 0,
        error: call.error?.slice(0, 500) ?? null,
        expiresAt: call.ttlDays ? new Date(Date.now() + call.ttlDays * 86_400_000) : null,
      },
    });
  } catch (err) {
    logger.error('provider_record.write_failed', { provider: call.provider, operation: call.operation, error: err });
    return null;
  }
}

/**
 * A successful, unexpired result for the same lookup anywhere in the
 * workspace. Paid enrichment of a company is reused across clients — the
 * company is the same company — but the reuse is recorded on the new caller.
 */
export async function findCachedRecord(params: {
  organizationId: string;
  provider: string;
  operation: string;
  lookupKey: string;
}) {
  return db.providerRecord.findFirst({
    where: {
      organizationId: params.organizationId,
      provider: params.provider,
      operation: params.operation,
      lookupKey: normalizeLookupKey(params.lookupKey),
      status: { in: ['SUCCESS', 'NOT_FOUND'] },
      // Records written without a TTL are history, never cache.
      expiresAt: { gt: new Date() },
    },
    orderBy: { requestedAt: 'desc' },
  });
}
