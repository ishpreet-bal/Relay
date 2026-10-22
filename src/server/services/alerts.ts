import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Operator alerts. One open alert per (organization, key): a condition that
 * keeps recurring bumps its count and last-seen time instead of adding a new
 * row, so the list stays short enough to act on.
 */

export type AlertSeverity = 'info' | 'warning' | 'critical';

export async function raiseAlert(params: {
  organizationId: string | null;
  severity: AlertSeverity;
  kind: string;
  title: string;
  detail?: string | null;
  dedupeKey: string;
}) {
  const org = params.organizationId;
  const existing = await db.systemAlert.findFirst({ where: { organizationId: org, dedupeKey: params.dedupeKey } });
  if (existing) {
    return db.systemAlert.update({
      where: { id: existing.id },
      data: {
        severity: params.severity, title: params.title, detail: params.detail ?? null, lastSeenAt: new Date(),
        occurrences: { increment: 1 },
        // A resolved condition that comes back reopens its alert.
        ...(existing.resolvedAt ? { resolvedAt: null, acknowledgedAt: null, acknowledgedById: null, firstSeenAt: new Date(), occurrences: 1 } : {}),
      },
    });
  }
  logger.warn('alert.raised', { organizationId: org, kind: params.kind, title: params.title });
  return db.systemAlert.create({ data: { ...params, organizationId: org, detail: params.detail ?? null } });
}

export async function resolveAlert(organizationId: string | null, dedupeKey: string) {
  return db.systemAlert.updateMany({ where: { organizationId, dedupeKey, resolvedAt: null }, data: { resolvedAt: new Date() } });
}

export function listAlerts(organizationId: string, opts: { includeResolved?: boolean } = {}) {
  return db.systemAlert.findMany({
    where: { OR: [{ organizationId }, { organizationId: null }], ...(opts.includeResolved ? {} : { resolvedAt: null }) },
    orderBy: [{ resolvedAt: { sort: 'desc', nulls: 'first' } }, { lastSeenAt: 'desc' }],
    take: 100,
  });
}

export async function acknowledgeAlert(organizationId: string, userId: string, id: string) {
  return db.systemAlert.updateMany({
    where: { id, OR: [{ organizationId }, { organizationId: null }] },
    data: { acknowledgedAt: new Date(), acknowledgedById: userId },
  });
}
