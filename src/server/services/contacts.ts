import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { clientFilter, type AccessContext } from '@/server/access/scope';
import { DomainError, NotFoundError } from '@/server/errors';
import { recordProvenance, TRACKED_CONTACT_FIELDS } from './provenance';
import { inferDepartment, inferSeniority } from './scoring/text';
import { findSuppression } from './suppression';
import { rescoreAccount } from './scoring';
import { logActivity } from './activity';
import { SENIORITIES, DATA_SOURCES } from '@/lib/domain';

export { SENIORITIES };

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);

export const contactInputSchema = z.object({
  firstName: optionalText(80),
  lastName: optionalText(80),
  title: optionalText(160),
  department: optionalText(80),
  seniority: z.enum(SENIORITIES).optional(),
  isDecisionMaker: z.boolean().optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional().nullable().or(z.literal('').transform(() => null)),
  emailVerification: z.enum(['UNVERIFIED', 'VALID', 'RISKY', 'INVALID', 'CATCH_ALL']).optional(),
  phone: optionalText(40),
  directPhone: optionalText(40),
  mobilePhone: optionalText(40),
  linkedinUrl: optionalText(300),
  city: optionalText(80),
  region: optionalText(80),
  country: optionalText(80),
  timezone: optionalText(60),
  source: z.enum(DATA_SOURCES).optional(),
  sourceProvider: optionalText(60),
  sourceRef: optionalText(200),
  sourceUrl: optionalText(500),
  consentBasis: z.enum(['UNKNOWN', 'IMPLIED_PUBLISHED', 'IMPLIED_RELATIONSHIP', 'EXPRESS']).optional(),
  consentNote: optionalText(500),
});
export type ContactInput = z.input<typeof contactInputSchema>;

/**
 * Creates one contact inside an existing transaction. Seniority and
 * department are inferred from the title when not supplied; an address or
 * number already on the suppression list arrives flagged, so it can never be
 * mistaken for a workable contact.
 */
export async function createContactRecord(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    clientId: string;
    accountId: string;
    input: ContactInput;
    isPrimary?: boolean;
    userId?: string | null;
  },
) {
  const input = contactInputSchema.parse(params.input);
  if (!input.email && !input.firstName && !input.lastName && !input.phone && !input.directPhone) {
    throw new DomainError('A contact needs at least a name, an email or a phone number.');
  }

  if (input.email) {
    const dupe = await tx.contact.findFirst({
      where: { accountId: params.accountId, email: { equals: input.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (dupe) return { contact: dupe, duplicate: true as const };
  }

  const domain = await tx.account.findUnique({ where: { id: params.accountId }, select: { domain: true } });
  const [emailBlock, phoneBlock] = await Promise.all([
    input.email
      ? findSuppression({ organizationId: params.organizationId, clientId: params.clientId, channel: 'EMAIL', email: input.email })
      : null,
    findSuppression({
      organizationId: params.organizationId, clientId: params.clientId, channel: 'PHONE',
      phone: input.directPhone ?? input.mobilePhone ?? input.phone, domain: domain?.domain,
    }),
  ]);

  const seniority = input.seniority ?? inferSeniority(input.title);
  const contact = await tx.contact.create({
    data: {
      organizationId: params.organizationId,
      clientId: params.clientId,
      accountId: params.accountId,
      firstName: input.firstName,
      lastName: input.lastName,
      title: input.title,
      department: input.department ?? inferDepartment(input.title),
      seniority,
      isDecisionMaker: input.isDecisionMaker ?? (seniority === 'OWNER' || seniority === 'C_LEVEL'),
      email: input.email,
      emailVerification: input.emailVerification ?? 'UNVERIFIED',
      phone: input.phone,
      directPhone: input.directPhone,
      mobilePhone: input.mobilePhone,
      linkedinUrl: input.linkedinUrl,
      city: input.city,
      region: input.region,
      country: input.country,
      timezone: input.timezone,
      isPrimary: params.isPrimary ?? false,
      source: input.source ?? 'MANUAL',
      sourceProvider: input.sourceProvider,
      sourceRef: input.sourceRef,
      sourceUrl: input.sourceUrl,
      sourcedAt: new Date(),
      consentBasis: input.consentBasis ?? 'UNKNOWN',
      consentNote: input.consentNote,
      doNotEmail: !!emailBlock,
      doNotCall: !!phoneBlock,
      ...(emailBlock || phoneBlock
        ? { suppressedAt: new Date(), suppressReason: (emailBlock ?? phoneBlock)!.reason }
        : {}),
    },
  });

  await recordProvenance(
    { organizationId: params.organizationId, contactId: contact.id },
    Object.fromEntries(TRACKED_CONTACT_FIELDS.map((f) => [f, contact[f]])),
    {
      source: contact.source,
      provider: input.sourceProvider,
      sourceUrl: input.sourceUrl,
      status: input.emailVerification === 'VALID' ? 'VERIFIED' : undefined,
      createdById: params.userId,
    },
    tx,
  );
  return { contact, duplicate: false as const };
}

export async function createContact(access: AccessContext, userId: string, accountId: string, input: ContactInput) {
  const account = await db.account.findFirst({
    where: { id: accountId, ...clientFilter(access), deletedAt: null },
    select: { id: true, clientId: true, _count: { select: { contacts: true } } },
  });
  if (!account) throw new NotFoundError('Account');

  const result = await db.$transaction((tx) =>
    createContactRecord(tx, {
      organizationId: access.organizationId,
      clientId: account.clientId,
      accountId,
      input,
      isPrimary: account._count.contacts === 0,
      userId,
    }),
  );
  if (!result.duplicate) {
    await logActivity({
      organizationId: access.organizationId, clientId: account.clientId, accountId, contactId: result.contact.id,
      userId, type: 'SYSTEM', title: 'Contact added',
    });
    await rescoreAccount(accountId);
  }
  return result;
}

export async function findContact(access: AccessContext, id: string) {
  const contact = await db.contact.findFirst({ where: { id, ...clientFilter(access), deletedAt: null } });
  if (!contact) throw new NotFoundError('Contact');
  return contact;
}

export async function updateContact(access: AccessContext, userId: string, id: string, data: Partial<ContactInput>) {
  const before = await findContact(access, id);
  const patch = contactInputSchema.partial().parse(data);
  if (patch.title !== undefined && patch.seniority === undefined) patch.seniority = inferSeniority(patch.title);
  if (patch.title !== undefined && patch.department === undefined) patch.department = inferDepartment(patch.title);

  const after = await db.contact.update({ where: { id }, data: patch });
  const changed = Object.fromEntries(TRACKED_CONTACT_FIELDS.filter((f) => f in patch).map((f) => [f, after[f]]));
  await recordProvenance({ organizationId: access.organizationId, contactId: id }, changed, { source: 'MANUAL', createdById: userId });
  await rescoreAccount(before.accountId);
  return { before, after };
}

export async function archiveContact(access: AccessContext, id: string) {
  const contact = await findContact(access, id);
  await db.$transaction([
    db.contact.update({ where: { id }, data: { deletedAt: new Date(), isPrimary: false } }),
    db.callTask.updateMany({
      where: { contactId: id, status: { in: ['OPEN', 'SNOOZED'] } },
      data: { status: 'CANCELLED', completedAt: new Date(), completedReason: 'Contact removed' },
    }),
    db.campaignEnrollment.updateMany({
      where: { contactId: id, status: { in: ['PENDING', 'ACTIVE', 'PAUSED'] } },
      data: { status: 'REMOVED', exitReason: 'Contact removed', nextActionAt: null, completedAt: new Date() },
    }),
  ]);
  await rescoreAccount(contact.accountId);
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export const contactFilterSchema = z.object({
  clientId: z.string().uuid().nullish(),
  accountId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  seniority: z.array(z.enum(SENIORITIES)).optional(),
  hasEmail: z.boolean().optional(),
  hasPhone: z.boolean().optional(),
  includeSuppressed: z.boolean().default(false),
  sort: z.enum(['score', 'createdAt', 'lastName', 'lastContactedAt']).default('score'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(10).max(200).default(50),
});
export type ContactFilter = z.infer<typeof contactFilterSchema>;

function contactWhere(access: AccessContext, f: ContactFilter): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = { ...clientFilter(access, f.clientId), deletedAt: null, account: { deletedAt: null } };
  const and: Prisma.ContactWhereInput[] = [];
  if (f.accountId) where.accountId = f.accountId;
  if (f.search) {
    and.push({ OR: [
      { firstName: { contains: f.search, mode: 'insensitive' } },
      { lastName: { contains: f.search, mode: 'insensitive' } },
      { email: { contains: f.search, mode: 'insensitive' } },
      { title: { contains: f.search, mode: 'insensitive' } },
      { account: { name: { contains: f.search, mode: 'insensitive' } } },
    ] });
  }
  if (f.seniority?.length) where.seniority = { in: f.seniority };
  if (f.hasEmail) and.push({ email: { not: null }, doNotEmail: false });
  if (f.hasPhone) and.push({ doNotCall: false, OR: [{ phone: { not: null } }, { directPhone: { not: null } }, { mobilePhone: { not: null } }] });
  if (!f.includeSuppressed) and.push({ NOT: { AND: [{ doNotEmail: true }, { doNotCall: true }] } });
  if (and.length) where.AND = and;
  return where;
}

export async function listContacts(access: AccessContext, filter: ContactFilter) {
  const rows = await db.contact.findMany({
    where: contactWhere(access, filter),
    orderBy: [{ [filter.sort]: filter.direction }, { id: 'asc' }],
    take: filter.limit + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    select: {
      id: true, firstName: true, lastName: true, title: true, seniority: true, email: true, emailVerification: true,
      phone: true, directPhone: true, mobilePhone: true, score: true, scoreBreakdown: true, doNotEmail: true, doNotCall: true,
      lastContactedAt: true, lastRepliedAt: true, source: true,
      account: { select: { id: true, name: true, score: true } },
      client: { select: { id: true, name: true } },
    },
  });
  const hasMore = rows.length > filter.limit;
  const items = hasMore ? rows.slice(0, filter.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

export function countContacts(access: AccessContext, filter: ContactFilter) {
  return db.contact.count({ where: contactWhere(access, filter) });
}

export async function getContactDetail(access: AccessContext, id: string) {
  const contact = await db.contact.findFirst({
    where: { id, ...clientFilter(access), deletedAt: null },
    include: {
      account: {
        select: {
          id: true, name: true, domain: true, websiteUrl: true, industry: true, city: true, region: true,
          employeeCount: true, employeeRange: true, score: true, status: true, researchSummary: true, phone: true,
        },
      },
      client: { select: { id: true, name: true } },
      callTask: true,
      enrollments: { include: { campaign: { select: { id: true, name: true, status: true } } } },
    },
  });
  if (!contact) throw new NotFoundError('Contact');
  return contact;
}

export { personName as contactName } from '@/lib/domain';
