import type { DataSource, EvidenceStatus, Prisma } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * Field-level provenance: for every important value on an account or contact,
 * where it came from, when, and how far it has been checked. When a field
 * changes the old record is kept (isCurrent = false), so "this email came from
 * provider X on the 5th and was verified on the 9th" stays answerable.
 */

export const TRACKED_ACCOUNT_FIELDS = [
  'name', 'websiteUrl', 'domain', 'phone', 'industry', 'employeeCount', 'employeeRange',
  'revenueRange', 'city', 'region', 'country', 'description', 'linkedinUrl', 'addressLine', 'postalCode',
  'latitude', 'longitude',
] as const;

export const TRACKED_CONTACT_FIELDS = [
  'firstName', 'lastName', 'title', 'department', 'email', 'phone', 'directPhone',
  'mobilePhone', 'linkedinUrl', 'city', 'region',
] as const;

export interface ProvenanceSource {
  source: DataSource;
  provider?: string | null;
  providerRecordId?: string | null;
  sourceUrl?: string | null;
  status?: EvidenceStatus;
  confidence?: number | null;
  createdById?: string | null;
  retrievedAt?: Date;
  /** For sources whose terms limit how long data may be kept. */
  retentionUntil?: Date | null;
}

function stringify(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Records provenance for the given field values. Unchanged values (same as
 * the current record) are skipped so re-imports don't bury the history.
 */
export async function recordProvenance(
  target: { organizationId: string; accountId?: string; contactId?: string },
  fields: Record<string, unknown>,
  from: ProvenanceSource,
  tx: Prisma.TransactionClient = db,
) {
  const entries = Object.entries(fields)
    .map(([field, value]) => [field, stringify(value)] as const)
    .filter((e): e is readonly [string, string] => e[1] !== null);
  if (!entries.length) return 0;

  const owner = target.contactId ? { contactId: target.contactId } : { accountId: target.accountId! };
  const current = await tx.dataProvenance.findMany({
    where: { ...owner, isCurrent: true, field: { in: entries.map(([f]) => f) } },
    select: { id: true, field: true, value: true },
  });
  const byField = new Map(current.map((c) => [c.field, c]));

  const changed = entries.filter(([field, value]) => byField.get(field)?.value !== value);
  if (!changed.length) return 0;

  const superseded = changed.map(([f]) => byField.get(f)?.id).filter((id): id is string => !!id);
  if (superseded.length) {
    await tx.dataProvenance.updateMany({ where: { id: { in: superseded } }, data: { isCurrent: false } });
  }
  await tx.dataProvenance.createMany({
    data: changed.map(([field, value]) => ({
      organizationId: target.organizationId,
      ...owner,
      field,
      value,
      source: from.source,
      provider: from.provider ?? null,
      providerRecordId: from.providerRecordId ?? null,
      sourceUrl: from.sourceUrl ?? null,
      status: from.status ?? (from.source === 'PROVIDER' ? 'PROVIDER_REPORTED' : 'UNVERIFIED'),
      confidence: from.confidence ?? null,
      createdById: from.createdById ?? null,
      retrievedAt: from.retrievedAt ?? new Date(),
      retentionUntil: from.retentionUntil ?? null,
    })),
  });
  return changed.length;
}

/** Marks the current value of a field as verified or rejected (e.g. after a bounce). */
export async function setFieldEvidence(
  target: { accountId?: string; contactId?: string },
  field: string,
  status: EvidenceStatus,
) {
  const owner = target.contactId ? { contactId: target.contactId } : { accountId: target.accountId! };
  return db.dataProvenance.updateMany({ where: { ...owner, field, isCurrent: true }, data: { status } });
}

/** Current provenance for an entity, keyed by field — what the UI shows on hover. */
export async function currentProvenance(target: { accountId?: string; contactId?: string }) {
  const owner = target.contactId ? { contactId: target.contactId } : { accountId: target.accountId! };
  const rows = await db.dataProvenance.findMany({ where: { ...owner, isCurrent: true }, orderBy: { retrievedAt: 'desc' } });
  return Object.fromEntries(rows.map((r) => [r.field, r]));
}
