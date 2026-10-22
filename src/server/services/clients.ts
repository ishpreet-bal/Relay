import { z } from 'zod';
import { startOfMonth } from 'date-fns';
import { db } from '@/lib/db';
import { canonicalDomain } from './companies/normalize';
import { clientFilter, assertClientAccess, type AccessContext } from '@/server/access/scope';
import { NotFoundError } from '@/server/errors';
import { markScoresStale } from './scoring';
import { SIGNAL_TYPES, SENIORITIES } from '@/lib/domain';

/**
 * Clients and what Relay needs to know to sell for them: the business, its
 * offers, its ideal customers, and the proof points outreach may cite.
 * Prospecting and messaging both depend on these, so they are first-class
 * records rather than free text on a campaign.
 */

const list = (max = 30, len = 200) => z.array(z.string().trim().min(1).max(len)).max(max).default([]);
const text = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);

export const clientProfileSchema = z.object({
  name: z.string().trim().min(1).max(160),
  websiteUrl: text(300),
  description: text(4000),
  productsServices: list(),
  serviceAreas: list(),
  industriesServed: list(),
  differentiators: list(20, 400),
  existingCustomers: list(500, 200),
  averageDealValueCents: z.number().int().min(0).max(1_000_000_000).nullish(),
  currency: z.string().length(3).default('CAD'),
  timezone: z.string().max(60).default('America/Toronto'),
  senderName: text(120),
  senderTitle: text(120),
  bookingUrl: z.string().url().max(500).nullish().or(z.literal('').transform(() => null)),
  primaryContactName: text(120),
  primaryContactEmail: z.string().email().max(254).nullish().or(z.literal('').transform(() => null)),
  primaryContactPhone: text(40),
});

/** Fields only Relay staff set. */
export const clientInternalSchema = z.object({
  status: z.enum(['ONBOARDING', 'ACTIVE', 'PAUSED', 'CHURNED']).optional(),
  notes: text(8000),
});

export const clientInputSchema = clientProfileSchema.merge(clientInternalSchema);
export type ClientInput = z.input<typeof clientInputSchema>;

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'client';
}

async function uniqueSlug(organizationId: string, name: string) {
  const base = slugify(name);
  for (let i = 1; i < 100; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const taken = await db.client.count({ where: { organizationId, slug } });
    if (!taken) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createClient(access: AccessContext, raw: ClientInput) {
  const input = clientInputSchema.parse(raw);
  return db.client.create({
    data: {
      ...input,
      organizationId: access.organizationId,
      slug: await uniqueSlug(access.organizationId, input.name),
      domain: canonicalDomain(input.websiteUrl),
      status: input.status ?? 'ONBOARDING',
    },
  });
}

export async function findClient(access: AccessContext, id: string) {
  assertClientAccess(access, id);
  const client = await db.client.findFirst({ where: { id, organizationId: access.organizationId, archivedAt: null } });
  if (!client) throw new NotFoundError('Client');
  return client;
}

/**
 * Updates a client. Client users may edit their business profile; internal
 * fields (status, notes) are dropped unless the caller is Relay staff.
 */
export async function updateClient(access: AccessContext, id: string, raw: Partial<ClientInput>, opts: { internal: boolean }) {
  await findClient(access, id);
  const schema = opts.internal ? clientInputSchema.partial() : clientProfileSchema.partial();
  const patch = schema.parse(raw) as Partial<z.infer<typeof clientInputSchema>>;
  const updated = await db.client.update({
    where: { id },
    data: {
      ...patch,
      ...(patch.websiteUrl !== undefined ? { domain: canonicalDomain(patch.websiteUrl) } : {}),
      ...(patch.status === 'ACTIVE' ? { onboardedAt: new Date() } : {}),
    },
  });
  return updated;
}

export async function archiveClient(access: AccessContext, id: string) {
  await findClient(access, id);
  await db.$transaction([
    db.client.update({ where: { id }, data: { archivedAt: new Date(), status: 'CHURNED' } }),
    db.campaign.updateMany({ where: { clientId: id, status: 'ACTIVE' }, data: { status: 'PAUSED' } }),
    db.callTask.updateMany({
      where: { clientId: id, status: { in: ['OPEN', 'SNOOZED'] } },
      data: { status: 'CANCELLED', completedAt: new Date(), completedReason: 'Client archived' },
    }),
  ]);
}

/** Clients in scope with the numbers an admin scans first. */
export async function listClients(access: AccessContext) {
  const scope = clientFilter(access);
  const clients = await db.client.findMany({
    // The demo sandbox holds synthetic data only and isn't a customer to manage or prospect for.
    where: { organizationId: access.organizationId, archivedAt: null, kind: 'CUSTOMER', ...(scope.clientId ? { id: scope.clientId } : {}) },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
    include: {
      _count: {
        select: {
          accounts: { where: { deletedAt: null } },
          campaigns: { where: { status: 'ACTIVE' } },
          offers: { where: { isActive: true } },
          icps: { where: { isActive: true } },
        },
      },
    },
  });
  const ids = clients.map((c) => c.id);
  const monthStart = startOfMonth(new Date());
  const [meetings, upcoming] = await Promise.all([
    db.meeting.groupBy({ by: ['clientId'], where: { clientId: { in: ids }, createdAt: { gte: monthStart }, status: { not: 'CANCELLED' } }, _count: true }),
    db.meeting.groupBy({ by: ['clientId'], where: { clientId: { in: ids }, startsAt: { gte: new Date() }, status: { in: ['BOOKED', 'CONFIRMED', 'RESCHEDULED'] } }, _count: true }),
  ]);
  return clients.map((c) => ({
    ...c,
    meetingsThisMonth: meetings.find((m) => m.clientId === c.id)?._count ?? 0,
    upcomingMeetings: upcoming.find((m) => m.clientId === c.id)?._count ?? 0,
    setupGaps: [
      c._count.offers === 0 ? 'No offer' : null,
      c._count.icps === 0 ? 'No ideal customer profile' : null,
      !c.senderName ? 'No sender name' : null,
    ].filter((g): g is string => !!g),
  }));
}

export async function getClientDetail(access: AccessContext, id: string) {
  await findClient(access, id);
  return db.client.findUniqueOrThrow({
    where: { id },
    include: {
      offers: { orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] },
      icps: { orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] },
      proofPoints: { orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] },
      playbooks: { where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, updatedAt: true } },
      memberships: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } },
    },
  });
}

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

export const offerInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(3).max(300),
  description: text(4000),
  valueProposition: text(2000),
  callToAction: z.string().trim().min(2).max(160).default('A 15-minute call'),
  typicalDealValueCents: z.number().int().min(0).max(1_000_000_000).nullish(),
  isActive: z.boolean().default(true),
});

export async function createOffer(access: AccessContext, clientId: string, raw: z.input<typeof offerInputSchema>) {
  await findClient(access, clientId);
  const input = offerInputSchema.parse(raw);
  return db.offer.create({ data: { ...input, organizationId: access.organizationId, clientId } });
}

export async function updateOffer(access: AccessContext, id: string, raw: Partial<z.input<typeof offerInputSchema>>) {
  const offer = await db.offer.findFirst({ where: { id, ...clientFilter(access) } });
  if (!offer) throw new NotFoundError('Offer');
  return db.offer.update({ where: { id }, data: offerInputSchema.partial().parse(raw) });
}

// ---------------------------------------------------------------------------
// Ideal customer profiles
// ---------------------------------------------------------------------------

export const icpInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: text(2000),
  industries: list(),
  industryKeywords: list(),
  excludedIndustries: list(),
  employeeMin: z.number().int().min(0).max(1_000_000).nullish(),
  employeeMax: z.number().int().min(0).max(1_000_000).nullish(),
  locations: list(50),
  requiredAttributes: list(15, 300),
  targetTitles: list(),
  targetDepartments: list(),
  targetSeniorities: z.array(z.enum(SENIORITIES)).max(8).default([]),
  smallCompanyMaxEmployees: z.number().int().min(1).max(10_000).nullish(),
  smallCompanyTitles: list(),
  preferredSignals: z.array(z.enum(SIGNAL_TYPES)).max(10).default([]),
  signalKeywords: list(),
  isActive: z.boolean().default(true),
}).refine((i) => i.employeeMin == null || i.employeeMax == null || i.employeeMax >= i.employeeMin, {
  message: 'Maximum employees must be at least the minimum.', path: ['employeeMax'],
});
export type IcpInput = z.input<typeof icpInputSchema>;

export async function createIcp(access: AccessContext, clientId: string, raw: IcpInput) {
  await findClient(access, clientId);
  const input = icpInputSchema.parse(raw);
  const icp = await db.idealCustomerProfile.create({ data: { ...input, organizationId: access.organizationId, clientId } });
  // Every account in the client may now fit differently.
  await markScoresStale({ clientId });
  return icp;
}

export async function updateIcp(access: AccessContext, id: string, raw: Partial<IcpInput>) {
  const icp = await db.idealCustomerProfile.findFirst({ where: { id, ...clientFilter(access) } });
  if (!icp) throw new NotFoundError('Ideal customer profile');
  const merged = icpInputSchema.parse({ ...icp, ...raw });
  const updated = await db.idealCustomerProfile.update({ where: { id }, data: merged });
  await markScoresStale({ clientId: icp.clientId });
  return updated;
}

// ---------------------------------------------------------------------------
// Proof points
// ---------------------------------------------------------------------------

export const proofPointInputSchema = z.object({
  kind: z.enum(['CASE_STUDY', 'TESTIMONIAL', 'CUSTOMER', 'RESULT', 'CERTIFICATION', 'CAPABILITY', 'OTHER']).default('CAPABILITY'),
  title: z.string().trim().min(1).max(160),
  statement: z.string().trim().min(5).max(1000),
  customerName: text(160),
  industry: text(120),
  sourceUrl: z.string().url().max(500).nullish().or(z.literal('').transform(() => null)),
  evidenceNote: text(1000),
  isActive: z.boolean().default(true),
});

export async function createProofPoint(access: AccessContext, clientId: string, raw: z.input<typeof proofPointInputSchema>) {
  await findClient(access, clientId);
  const input = proofPointInputSchema.parse(raw);
  return db.proofPoint.create({ data: { ...input, organizationId: access.organizationId, clientId } });
}

export async function updateProofPoint(access: AccessContext, id: string, raw: Partial<z.input<typeof proofPointInputSchema>>) {
  const point = await db.proofPoint.findFirst({ where: { id, ...clientFilter(access) } });
  if (!point) throw new NotFoundError('Proof point');
  const patch = proofPointInputSchema.partial().parse(raw);
  // Changing the wording withdraws approval: approval attaches to words.
  const reworded = patch.statement !== undefined && patch.statement !== point.statement;
  return db.proofPoint.update({
    where: { id },
    data: { ...patch, ...(reworded ? { approvedForOutreach: false, approvedAt: null, approvedById: null } : {}) },
  });
}

/** Approving a proof point lets drafts state it about the client without review. */
export async function setProofPointApproval(access: AccessContext, userId: string, id: string, approved: boolean) {
  const point = await db.proofPoint.findFirst({ where: { id, ...clientFilter(access) } });
  if (!point) throw new NotFoundError('Proof point');
  return db.proofPoint.update({
    where: { id },
    data: approved
      ? { approvedForOutreach: true, approvedAt: new Date(), approvedById: userId }
      : { approvedForOutreach: false, approvedAt: null, approvedById: null },
  });
}
