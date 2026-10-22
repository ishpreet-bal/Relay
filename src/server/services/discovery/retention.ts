import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Removes values whose source only allows them to be kept for a limited
 * time (today: coordinates from Google Places, 30 days). The value is cleared
 * from the account when it is still the one the source supplied, and the
 * cached copy in the provenance record is deleted. Refreshing from the
 * source (the next discovery run that finds the business) stores it again
 * with a new date.
 */

const NOT_CLEARABLE = new Set(['name']);

function stringify(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export async function sweepRetention(now = new Date(), limit = 1000) {
  const expired = await db.dataProvenance.findMany({
    where: { retentionUntil: { lte: now }, isCurrent: true },
    select: { id: true, accountId: true, field: true, value: true },
    take: limit,
  });
  if (!expired.length) return { values: 0, accounts: 0 };

  const byAccount = new Map<string, typeof expired>();
  const orphaned: string[] = [];
  for (const row of expired) {
    if (!row.accountId) { orphaned.push(row.id); continue; }
    byAccount.set(row.accountId, [...(byAccount.get(row.accountId) ?? []), row]);
  }

  let cleared = 0;
  for (const [accountId, rows] of byAccount) {
    const account = await db.account.findUnique({ where: { id: accountId } });
    const patch: Record<string, null> = {};
    if (account) {
      for (const row of rows) {
        const current = stringify((account as Record<string, unknown>)[row.field]);
        if (!NOT_CLEARABLE.has(row.field) && current !== null && current === row.value) patch[row.field] = null;
      }
    }
    await db.$transaction([
      ...(account && Object.keys(patch).length ? [db.account.update({ where: { id: accountId }, data: patch })] : []),
      db.dataProvenance.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { isCurrent: false, value: null, retentionUntil: null } }),
    ]);
    cleared += Object.keys(patch).length;
  }
  if (orphaned.length) {
    await db.dataProvenance.updateMany({ where: { id: { in: orphaned } }, data: { isCurrent: false, value: null, retentionUntil: null } });
  }
  logger.info('retention.swept', { values: expired.length, cleared, accounts: byAccount.size });
  return { values: expired.length, accounts: byAccount.size, cleared };
}
