import { z } from 'zod';
import { Prisma, type AccountStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { toDomain } from '@/lib/utils';
import { clientFilter, assertClientAccess, type AccessContext } from '@/server/access/scope';
import { NotFoundError } from '@/server/errors';
import { logActivity } from './activity';
import { recordProvenance, TRACKED_ACCOUNT_FIELDS } from './provenance';
import { rescoreAccount } from './scoring';
import { createContactRecord, contactInputSchema } from './contacts';
import { ACCOUNT_STATUSES, DATA_SOURCES } from '@/lib/domain';

export { ACCOUNT_STATUSES, DATA_SOURCES };

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const LIFECYCLE: AccountStatus[] = [
  'DISCOVERED', 'ENRICHED', 'QUALIFIED', 'ACTIVE_OUTREACH', 'ENGAGED', 'CALLING', 'MEETING_BOOKED', 'WON',
];
const TERMINAL: AccountStatus[] = ['WON', 'LOST', 'DISQUALIFIED'];

/** Whether an automatic transition from `from` to `to` moves the account forward. */
export function isForward(from: AccountStatus, to: AccountStatus): boolean {
  if (TERMINAL.includes(from)) return false;
  return LIFECYCLE.indexOf(to) > LIFECYCLE.indexOf(from);
}

/**
 * System-driven status changes only ever move an account forward: a reply
 * arriving after a meeting was booked must not drag it back to ENGAGED, and
 * nothing automatic reopens a won, lost or disqualified account.
 */
export async function advanceAccountStatus(
  accountId: string,
  to: AccountStatus,
  tx: Prisma.TransactionClient = db,
) {
  const account = await tx.account.findUnique({ where: { id: accountId }, select: { status: true } });
  if (!account || !isForward(account.status, to)) return false;
  await tx.account.update({ where: { id: accountId }, data: { status: to } });
  return true;
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export const accountFilterSchema = z.object({
  clientId: z.string().uuid().nullish(),
  search: z.string().trim().max(120).optional(),
  status: z.array(z.enum(ACCOUNT_STATUSES)).optional(),
  industry: z.array(z.string()).optional(),
  region: z.array(z.string()).optional(),
  icpId: z.string().uuid().optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  hasContacts: z.boolean().optional(),
  hasPhone: z.boolean().optional(),
  hasSignals: z.boolean().optional(),
  includeDoNotContact: z.boolean().default(false),
  sort: z.enum(['score', 'fitScore', 'createdAt', 'name', 'lastContactedAt']).default('score'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(10).max(200).default(50),
});
export type AccountFilter = z.infer<typeof accountFilterSchema>;

function buildWhere(access: AccessContext, f: AccountFilter): Prisma.AccountWhereInput {
  const where: Prisma.AccountWhereInput = { ...clientFilter(access, f.clientId), deletedAt: null };
  const and: Prisma.AccountWhereInput[] = [];

  if (f.search) {
    and.push({
      OR: [
        { name: { contains: f.search, mode: 'insensitive' } },
        { domain: { contains: f.search, mode: 'insensitive' } },
        { city: { contains: f.search, mode: 'insensitive' } },
        { contacts: { some: { OR: [
          { email: { contains: f.search, mode: 'insensitive' } },
          { lastName: { contains: f.search, mode: 'insensitive' } },
        ] } } },
      ],
    });
  }
  if (f.status?.length) where.status = { in: f.status };
  if (f.industry?.length) where.industry = { in: f.industry };
  if (f.region?.length) where.region = { in: f.region };
  if (f.icpId) where.icpId = f.icpId;
  if (f.minScore != null) where.score = { gte: f.minScore };
  if (!f.includeDoNotContact) where.doNotContact = false;
  if (f.hasContacts) and.push({ contacts: { some: { deletedAt: null } } });
  if (f.hasPhone) {
    and.push({ contacts: { some: { deletedAt: null, doNotCall: false, OR: [{ directPhone: { not: null } }, { mobilePhone: { not: null } }, { phone: { not: null } }] } } });
  }
  if (f.hasSignals) and.push({ signals: { some: { dismissedAt: null } } });
  if (and.length) where.AND = and;
  return where;
}

export async function listAccounts(access: AccessContext, filter: AccountFilter) {
  const rows = await db.account.findMany({
    where: buildWhere(access, filter),
    // Cursor pagination: the table is sorted by score, and offset paging
    // drifts as scores update underneath the operator.
    orderBy: [{ [filter.sort]: filter.direction }, { id: 'asc' }],
    take: filter.limit + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    select: {
      id: true, name: true, domain: true, industry: true, city: true, region: true,
      employeeCount: true, employeeRange: true, status: true, score: true, fitScore: true,
      scoreBreakdown: true, scoreOverride: true, doNotContact: true, lastContactedAt: true, createdAt: true,
      client: { select: { id: true, name: true } },
      icp: { select: { id: true, name: true } },
      contacts: {
        where: { deletedAt: null },
        orderBy: { score: 'desc' },
        take: 1,
        select: { id: true, firstName: true, lastName: true, title: true, score: true },
      },
      _count: { select: { contacts: { where: { deletedAt: null } }, signals: { where: { dismissedAt: null } } } },
    },
  });
  const hasMore = rows.length > filter.limit;
  const items = hasMore ? rows.slice(0, filter.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

export function countAccounts(access: AccessContext, filter: AccountFilter) {
  return db.account.count({ where: buildWhere(access, filter) });
}

export async function accountFacets(access: AccessContext, clientId?: string | null) {
  const where = { ...clientFilter(access, clientId), deletedAt: null };
  const [industries, regions, statuses] = await Promise.all([
    db.account.groupBy({ by: ['industry'], where: { ...where, industry: { not: null } }, _count: true, orderBy: { _count: { industry: 'desc' } }, take: 30 }),
    db.account.groupBy({ by: ['region'], where: { ...where, region: { not: null } }, _count: true, orderBy: { _count: { region: 'desc' } }, take: 20 }),
    db.account.groupBy({ by: ['status'], where, _count: true }),
  ]);
  return {
    industries: industries.map((i) => ({ value: i.industry!, count: i._count })),
    regions: regions.map((r) => ({ value: r.region!, count: r._count })),
    statuses: statuses.map((s) => ({ value: s.status, count: s._count })),
  };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export async function findAccount(access: AccessContext, id: string) {
  const account = await db.account.findFirst({ where: { id, ...clientFilter(access), deletedAt: null } });
  if (!account) throw new NotFoundError('Account');
  return account;
}

export async function getAccountDetail(access: AccessContext, id: string) {
  const account = await db.account.findFirst({
    where: { id, ...clientFilter(access), deletedAt: null },
    include: {
      client: { select: { id: true, name: true, timezone: true } },
      icp: { select: { id: true, name: true } },
      owner: { select: { id: true, firstName: true, lastName: true } },
      contacts: { where: { deletedAt: null }, orderBy: [{ score: 'desc' }, { createdAt: 'asc' }] },
      signals: { where: { dismissedAt: null }, orderBy: [{ eventDate: { sort: 'desc', nulls: 'last' } }, { detectedAt: 'desc' }], take: 25 },
      research: { select: { id: true, status: true, companySummary: true, confidence: true, refreshedAt: true, error: true } },
      meetings: { orderBy: { startsAt: 'desc' }, take: 10, include: { contact: { select: { firstName: true, lastName: true } } } },
      enrollments: {
        where: { status: { in: ['PENDING', 'ACTIVE', 'PAUSED'] } },
        include: { campaign: { select: { id: true, name: true, status: true } } },
      },
    },
  });
  if (!account) throw new NotFoundError('Account');
  return account;
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);

export const accountFieldsSchema = z.object({
  name: z.string().trim().min(1).max(200),
  websiteUrl: optionalText(300),
  linkedinUrl: optionalText(300),
  phone: optionalText(40),
  industry: optionalText(120),
  employeeCount: z.number().int().min(0).max(1_000_000).optional().nullable(),
  employeeRange: optionalText(40),
  revenueRange: optionalText(60),
  description: optionalText(4000),
  addressLine: optionalText(200),
  city: optionalText(80),
  region: optionalText(80),
  postalCode: optionalText(20),
  country: optionalText(80),
  tags: z.array(z.string().max(40)).max(30).default([]),
  notes: optionalText(5000),
});

export const accountInputSchema = accountFieldsSchema.extend({
  clientId: z.string().uuid(),
  source: z.enum(DATA_SOURCES).default('MANUAL'),
  sourceRef: optionalText(200),
  contacts: z.array(contactInputSchema).max(25).default([]),
});
export type AccountInput = z.input<typeof accountInputSchema>;

export type CreateAccountResult =
  | { status: 'created'; accountId: string }
  | { status: 'duplicate'; accountId: string }
  | { status: 'excluded'; reason: string };

function isExistingCustomer(client: { existingCustomers: string[] }, name: string, domain: string | null) {
  const n = name.toLowerCase().trim();
  return client.existingCustomers.some((c) => {
    const v = c.toLowerCase().trim();
    return (domain && toDomain(v) === domain) || v === n;
  });
}

/**
 * Creates an account (and any contacts supplied with it) for one client.
 * Dedupes on domain within the client — the same company can be a prospect
 * for two clients without them sharing a record. The client's existing
 * customers are never created as prospects.
 */
export async function createAccount(
  access: AccessContext,
  userId: string | null,
  raw: AccountInput,
): Promise<CreateAccountResult> {
  const input = accountInputSchema.parse(raw);
  assertClientAccess(access, input.clientId);

  const client = await db.client.findFirst({
    where: { id: input.clientId, organizationId: access.organizationId, archivedAt: null },
    select: { id: true, existingCustomers: true },
  });
  if (!client) throw new NotFoundError('Client');

  const domain = toDomain(input.websiteUrl);
  if (isExistingCustomer(client, input.name, domain)) {
    return { status: 'excluded', reason: 'Already a customer of this client' };
  }

  const result = await db.$transaction(async (tx) => {
    const existing = domain
      ? await tx.account.findFirst({ where: { clientId: client.id, domain }, select: { id: true } })
      : await tx.account.findFirst({
          where: { clientId: client.id, name: { equals: input.name, mode: 'insensitive' }, city: input.city, deletedAt: null },
          select: { id: true },
        });
    if (existing) return { status: 'duplicate' as const, accountId: existing.id };

    const { contacts, clientId, source, sourceRef, ...fields } = input;
    const account = await tx.account.create({
      data: {
        ...fields,
        organizationId: access.organizationId,
        clientId,
        domain,
        country: fields.country ?? 'CA',
        source,
        sourceRef,
        ownerId: userId,
      },
    });

    await recordProvenance(
      { organizationId: access.organizationId, accountId: account.id },
      pick(account, TRACKED_ACCOUNT_FIELDS),
      { source, createdById: userId },
      tx,
    );
    for (const [i, contact] of contacts.entries()) {
      await createContactRecord(tx, {
        organizationId: access.organizationId,
        clientId,
        accountId: account.id,
        input: { ...contact, source: contact.source ?? source },
        isPrimary: i === 0,
        userId,
      });
    }
    await logActivity({
      organizationId: access.organizationId, clientId, accountId: account.id, userId, type: 'SYSTEM',
      title: 'Account added', body: `Source: ${source.toLowerCase().replace(/_/g, ' ')}`, tx,
    });
    return { status: 'created' as const, accountId: account.id };
  });

  if (result.status === 'created') await rescoreAccount(result.accountId);
  return result;
}

export async function updateAccount(
  access: AccessContext,
  userId: string,
  id: string,
  data: Partial<z.infer<typeof accountFieldsSchema>>,
) {
  const before = await findAccount(access, id);
  const patch = accountFieldsSchema.partial().parse(data);
  const domain = patch.websiteUrl !== undefined ? toDomain(patch.websiteUrl) : undefined;

  const after = await db.account.update({
    where: { id },
    data: { ...patch, ...(domain !== undefined ? { domain } : {}) },
  });
  const changed = Object.fromEntries(
    TRACKED_ACCOUNT_FIELDS
      .filter((f) => f in patch || (f === 'domain' && domain !== undefined))
      .map((f) => [f, after[f]]),
  );
  await recordProvenance({ organizationId: access.organizationId, accountId: id }, changed, { source: 'MANUAL', createdById: userId });
  await rescoreAccount(id);
  return { before, after };
}

export async function setAccountStatus(
  access: AccessContext,
  userId: string,
  id: string,
  status: AccountStatus,
  reason?: string,
) {
  const before = await findAccount(access, id);
  const after = await db.account.update({
    where: { id },
    data: { status, ...(status === 'DISQUALIFIED' ? { disqualifiedReason: reason ?? null } : {}) },
  });
  await logActivity({
    organizationId: access.organizationId, clientId: before.clientId, accountId: id, userId, type: 'STATUS_CHANGE',
    title: `Status changed to ${status.toLowerCase().replace(/_/g, ' ')}`,
    body: reason, metadata: { from: before.status, to: status },
  });
  if (status === 'DISQUALIFIED' || status === 'LOST') {
    // A closed account leaves the call queue.
    await db.callTask.updateMany({
      where: { accountId: id, status: { in: ['OPEN', 'SNOOZED'] } },
      data: { status: 'CANCELLED', completedAt: new Date(), completedReason: `Account ${status.toLowerCase()}` },
    });
  }
  return { before, after };
}

/** Manual score override. The computed breakdown is kept alongside it. */
export async function overrideScore(
  access: AccessContext,
  userId: string,
  id: string,
  score: number | null,
  reason: string | null,
) {
  const before = await findAccount(access, id);
  await db.account.update({
    where: { id },
    data: score === null
      ? { scoreOverride: null, scoreOverrideReason: null, scoreOverriddenById: null, scoreOverriddenAt: null }
      : { scoreOverride: score, scoreOverrideReason: reason, scoreOverriddenById: userId, scoreOverriddenAt: new Date() },
  });
  await logActivity({
    organizationId: access.organizationId, clientId: before.clientId, accountId: id, userId, type: 'SCORE_OVERRIDE',
    title: score === null ? 'Score override removed' : `Score set to ${score} by hand`,
    body: reason, metadata: { from: before.score, to: score },
  });
  return rescoreAccount(id);
}

export async function archiveAccount(access: AccessContext, id: string) {
  await findAccount(access, id);
  // Soft delete only. Outreach history must survive for suppression and
  // compliance evidence.
  await db.$transaction([
    db.account.update({ where: { id }, data: { deletedAt: new Date() } }),
    db.callTask.updateMany({
      where: { accountId: id, status: { in: ['OPEN', 'SNOOZED'] } },
      data: { status: 'CANCELLED', completedAt: new Date(), completedReason: 'Account archived' },
    }),
  ]);
}

function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((k) => [k, obj[k]])) as Pick<T, K>;
}
