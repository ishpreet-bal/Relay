import { db } from './db';
import type { Session } from './auth';

/**
 * Audit entries are written in the same transaction as the change wherever
 * possible. A log that can drift from the data it describes is worse than none.
 */
export async function recordAudit(params: {
  session: Session;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  tx?: typeof db;
}) {
  const client = params.tx ?? db;
  await client.auditLog.create({
    data: {
      organizationId: params.session.organizationId,
      userId: params.session.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      before: (params.before ?? null) as never,
      after: (params.after ?? null) as never,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  });
}
