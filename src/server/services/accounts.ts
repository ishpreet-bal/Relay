import { z } from 'zod';
import { Prisma, type AccountStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { clientFilter, assertClientAccess, type AccessContext } from '@/server/access/scope';
import { NotFoundError } from '@/server/errors';
import { logActivity } from './activity';
import { recordProvenance, TRACKED_ACCOUNT_FIELDS } from './provenance';
import { rescoreAccount } from './scoring';
import { createContactRecord, contactInputSchema } from './contacts';
import { canonicalDomain, normalizeCompanyName, socialNetworkOf } from './companies/normalize';
import { fillableFields } from './companies/match';
import { lockCompanyKey, matchCompany } from './companies/dedup';
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

export function buildWhere(access: AccessContext, f: AccountFilter): Prisma.AccountWhereInput {
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
      parent: { select: { id: true, name: true, city: true } },
      branches: { where: { deletedAt: null }, select: { id: true, name: true, city: true }, orderBy: { name: 'asc' }, take: 25 },
      identifiers: { select: { provider: true, externalId: true, createdAt: true } },
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

const SOCIAL_NETWORKS = ['facebook', 'instagram', 'linkedin', 'x', 'tiktok', 'youtube'] as const;

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
  businessModel: optionalText(120),
  foundedYear: z.number().int().min(1800).max(2100).optional().nullable(),
  addressLine: optionalText(200),
  city: optionalText(80),
  region: optionalText(80),
  postalCode: optionalText(20),
  country: optionalText(80),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  socialProfiles: z.record(z.enum(SOCIAL_NETWORKS), z.string().url().max(300)).optional().nullable(),
  tags: z.array(z.string().max(40)).max(30).default([]),
  notes: optionalText(5000),
});

export const accountInputSchema = accountFieldsSchema.extend({
  clientId: z.string().uuid(),
  source: z.enum(DATA_SOURCES).default('MANUAL'),
  sourceRef: optionalText(200),
  /** Stable ids at outside sources: the strongest duplicate check there is. */
  identifiers: z.array(z.object({ provider: z.string().min(1).max(40), externalId: z.string().min(1).max(200) })).max(10).default([]),
  contacts: z.array(contactInputSchema).max(25).default([]),
});
export type AccountInput = z.input<typeof accountInputSchema>;

/** Where the data came from, for provenance and retention. */
export interface AccountSourceInfo {
  provider?: string | null;
  sourceUrl?: string | null;
  discoveryRunId?: string | null;
  /** Days the source allows its data to be kept (e.g. Google Places content). */
  retentionDays?: number | null;
  /** What to call this source in the activity timeline. */
  label?: string;
}

export type CreateAccountResult =
  | { status: 'created'; accountId: string; review?: { candidateId: string; score: number } }
  | { status: 'duplicate'; accountId: string; filled: string[]; score: number }
  | { status: 'excluded'; reason: string };

function isExistingCustomer(client: { existingCustomers: string[] }, name: string, domain: string | null) {
  const n = normalizeCompanyName(name);
  return client.existingCustomers.some((c) => {
    const v = c.trim();
    return (domain && canonicalDomain(v) === domain) || normalizeCompanyName(v) === n;
  });
}

/** Website and social profile, sorted out: a Facebook page is not a website. */
function splitWebsite(websiteUrl: string | null | undefined, social: Record<string, string> | null | undefined) {
  const network = socialNetworkOf(websiteUrl);
  if (websiteUrl && network) {
    return { websiteUrl: null, domain: null, socialProfiles: { ...(social ?? {}), [network]: websiteUrl } };
  }
  return { websiteUrl: websiteUrl ?? null, domain: canonicalDomain(websiteUrl), socialProfiles: social ?? null };
}

// Fields a matched record may be enriched with. Never name or status: those
// are what a person sees and decides on.
const ENRICHABLE = [
  'websiteUrl', 'domain', 'linkedinUrl', 'phone', 'industry', 'employeeCount', 'employeeRange', 'revenueRange',
  'description', 'businessModel', 'foundedYear', 'addressLine', 'city', 'region', 'postalCode', 'latitude', 'longitude',
] as const;

/**
 * Creates an account (and any contacts supplied with it) for one client, or
 * recognises it as one already there.
 *
 * Matching (services/companies) runs under a per-company lock, so concurrent
 * imports and discovery jobs cannot both insert the same business:
 *   - a strong match enriches the existing record — empty fields only, never
 *     overwriting what is already known — and adds the new source's ids;
 *   - a borderline match creates the record and flags the pair for a person;
 *   - otherwise it is new.
 * The same company can be a prospect for two clients without sharing a
 * record. A client's existing customers are never created as prospects.
 */
export async function createAccount(
  access: AccessContext,
  userId: string | null,
  raw: AccountInput,
  sourceInfo: AccountSourceInfo = {},
): Promise<CreateAccountResult> {
  const input = accountInputSchema.parse(raw);
  assertClientAccess(access, input.clientId);

  const client = await db.client.findFirst({
    where: { id: input.clientId, organizationId: access.organizationId, archivedAt: null },
    select: { id: true, existingCustomers: true },
  });
  if (!client) throw new NotFoundError('Client');

  const site = splitWebsite(input.websiteUrl, input.socialProfiles);
  const domain = site.domain;
  if (isExistingCustomer(client, input.name, domain)) {
    return { status: 'excluded', reason: 'Already a customer of this client' };
  }

  const normalizedName = normalizeCompanyName(input.name);
  const retentionUntil = sourceInfo.retentionDays ? new Date(Date.now() + sourceInfo.retentionDays * 86_400_000) : null;
  const provenanceFrom = {
    source: input.source,
    provider: sourceInfo.provider ?? null,
    sourceUrl: sourceInfo.sourceUrl ?? null,
    createdById: userId,
    retentionUntil,
  };

  const result = await db.$transaction(async (tx) => {
    await lockCompanyKey(tx, client.id, domain ?? normalizedName);
    const decision = await matchCompany(tx, client.id, {
      normalizedName,
      domain,
      city: input.city,
      region: input.region,
      addressLine: input.addressLine,
      phone: input.phone,
      identifiers: input.identifiers,
      contactEmails: input.contacts.map((c) => c.email).filter((e): e is string => !!e),
    });

    if (decision.action === 'match') {
      const existing = await tx.account.findUniqueOrThrow({ where: { id: decision.match.id } });
      const incoming = {
        ...input, websiteUrl: site.websiteUrl, domain,
      } as Partial<typeof existing>;
      const patch = fillableFields(existing, incoming, ENRICHABLE);
      // A domain another account of this client already holds cannot be added.
      if (patch.domain && await tx.account.count({ where: { clientId: client.id, domain: patch.domain } })) {
        delete patch.domain;
        delete patch.websiteUrl;
      }
      const socialPatch = site.socialProfiles
        ? { ...(site.socialProfiles), ...((existing.socialProfiles as Record<string, string> | null) ?? {}) }
        : undefined;
      if (Object.keys(patch).length || socialPatch) {
        await tx.account.update({
          where: { id: existing.id },
          data: { ...(patch as Prisma.AccountUncheckedUpdateInput), ...(socialPatch ? { socialProfiles: socialPatch } : {}) },
        });
        await recordProvenance(
          { organizationId: access.organizationId, accountId: existing.id },
          pick(patch as Record<string, unknown>, Object.keys(patch).filter((k) => (TRACKED_ACCOUNT_FIELDS as readonly string[]).includes(k))),
          provenanceFrom,
          tx,
        );
      }
      await addIdentifiers(tx, access.organizationId, client.id, existing.id, input.identifiers);
      for (const contact of input.contacts) {
        await createContactRecord(tx, {
          organizationId: access.organizationId, clientId: client.id, accountId: existing.id,
          input: { ...contact, source: contact.source ?? input.source }, isPrimary: false, userId,
        });
      }
      if (Object.keys(patch).length) {
        await logActivity({
          organizationId: access.organizationId, clientId: client.id, accountId: existing.id, userId, type: 'ENRICHMENT',
          title: `Matched from ${sourceInfo.label ?? input.source.toLowerCase().replace(/_/g, ' ')}`,
          body: `Added ${Object.keys(patch).join(', ')}. ${decision.score.reasons[0]?.label ?? ''}`.trim(), tx,
        });
      }
      return { status: 'duplicate' as const, accountId: existing.id, filled: Object.keys(patch), score: decision.score.score };
    }

    const { contacts, clientId, source, sourceRef, identifiers, socialProfiles: _s, ...fields } = input;
    void _s;
    const account = await tx.account.create({
      data: {
        ...fields,
        websiteUrl: site.websiteUrl,
        socialProfiles: site.socialProfiles ?? undefined,
        organizationId: access.organizationId,
        clientId,
        domain,
        normalizedName,
        country: fields.country ?? 'CA',
        source,
        sourceRef,
        discoveryRunId: sourceInfo.discoveryRunId ?? null,
        ownerId: userId,
      },
    });
    await addIdentifiers(tx, access.organizationId, clientId, account.id, identifiers);
    await recordProvenance(
      { organizationId: access.organizationId, accountId: account.id },
      pick(account, TRACKED_ACCOUNT_FIELDS),
      provenanceFrom,
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
    let review: { candidateId: string; score: number } | undefined;
    if (decision.action === 'review') {
      await tx.duplicateCandidate.create({
        data: {
          organizationId: access.organizationId, clientId, accountId: account.id, candidateId: decision.match.id,
          score: decision.score.score,
          reasons: { reasons: decision.score.reasons, conflict: decision.score.conflict } as unknown as Prisma.InputJsonValue,
          source: sourceInfo.label ?? source,
        },
      });
      review = { candidateId: decision.match.id, score: decision.score.score };
    }
    await logActivity({
      organizationId: access.organizationId, clientId, accountId: account.id, userId, type: 'SYSTEM',
      title: 'Account added',
      body: `Source: ${sourceInfo.label ?? source.toLowerCase().replace(/_/g, ' ')}${review ? ' · possible duplicate flagged for review' : ''}`,
      tx,
    });
    return { status: 'created' as const, accountId: account.id, review };
  });

  if (result.status === 'created' || result.filled.length) await rescoreAccount(result.accountId);
  return result;
}

async function addIdentifiers(
  tx: Prisma.TransactionClient,
  organizationId: string,
  clientId: string,
  accountId: string,
  identifiers: Array<{ provider: string; externalId: string }>,
) {
  if (!identifiers.length) return;
  await tx.discoveryIdentifier.createMany({
    data: identifiers.map((i) => ({ organizationId, clientId, accountId, provider: i.provider, externalId: i.externalId })),
    skipDuplicates: true,
  });
}

export async function updateAccount(
  access: AccessContext,
  userId: string,
  id: string,
  data: Partial<z.infer<typeof accountFieldsSchema>>,
) {
  const before = await findAccount(access, id);
  const patch = accountFieldsSchema.partial().parse(data);
  const site = patch.websiteUrl !== undefined
    ? splitWebsite(patch.websiteUrl, patch.socialProfiles ?? (before.socialProfiles as Record<string, string> | null))
    : null;

  const { socialProfiles, ...scalars } = patch;
  const after = await db.account.update({
    where: { id },
    data: {
      ...scalars,
      ...(site ? { websiteUrl: site.websiteUrl, domain: site.domain, socialProfiles: site.socialProfiles ?? undefined } : {}),
      ...(socialProfiles !== undefined && !site ? { socialProfiles: socialProfiles ?? Prisma.DbNull } : {}),
      ...(patch.name ? { normalizedName: normalizeCompanyName(patch.name) } : {}),
      lastVerifiedAt: new Date(),
    },
  });
  const changed = Object.fromEntries(
    TRACKED_ACCOUNT_FIELDS
      .filter((f) => f in patch || (f === 'domain' && site))
      .map((f) => [f, after[f]]),
  );
  await recordProvenance({ organizationId: access.organizationId, accountId: id }, changed, { source: 'MANUAL', createdById: userId, status: 'VERIFIED' });
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
