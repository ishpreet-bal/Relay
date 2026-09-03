import { z } from 'zod';
import { Prisma, type LeadStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { toDomain } from '@/lib/utils';
import { scoreLead, temperatureFor } from './scoring';
import { logActivity } from './crm';

export const leadFilterSchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.array(z.string()).optional(),
  industry: z.array(z.string()).optional(),
  city: z.array(z.string()).optional(),
  region: z.array(z.string()).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  maxScore: z.number().int().min(0).max(100).optional(),
  minEmployees: z.number().int().min(0).optional(),
  maxEmployees: z.number().int().min(0).optional(),
  hasEmail: z.boolean().optional(),
  hasWebsite: z.boolean().optional(),
  hasLinkedin: z.boolean().optional(),
  techStack: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  sort: z.enum(['score', 'createdAt', 'companyName', 'lastContactedAt']).default('score'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(10).max(200).default(50),
});
export type LeadFilter = z.infer<typeof leadFilterSchema>;

function buildWhere(organizationId: string, f: LeadFilter): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { organizationId, deletedAt: null };

  if (f.search) {
    where.OR = [
      { companyName: { contains: f.search, mode: 'insensitive' } },
      { domain: { contains: f.search, mode: 'insensitive' } },
      { city: { contains: f.search, mode: 'insensitive' } },
      { contacts: { some: { email: { contains: f.search, mode: 'insensitive' } } } },
    ];
  }
  if (f.status?.length) where.status = { in: f.status as LeadStatus[] };
  if (f.industry?.length) where.industry = { in: f.industry };
  if (f.city?.length) where.city = { in: f.city };
  if (f.region?.length) where.region = { in: f.region };
  if (f.tags?.length) where.tags = { hasSome: f.tags };
  if (f.techStack?.length) where.techStack = { hasSome: f.techStack };
  if (f.ownerId !== undefined) where.ownerId = f.ownerId;

  if (f.minScore != null || f.maxScore != null) {
    where.score = { gte: f.minScore ?? undefined, lte: f.maxScore ?? undefined };
  }
  if (f.minEmployees != null || f.maxEmployees != null) {
    where.employeeCount = { gte: f.minEmployees ?? undefined, lte: f.maxEmployees ?? undefined };
  }
  if (f.hasWebsite) where.websiteUrl = { not: null };
  if (f.hasLinkedin) where.linkedinUrl = { not: null };
  if (f.hasEmail) {
    where.contacts = { some: { email: { not: null }, emailVerification: { in: ['VALID', 'CATCH_ALL'] } } };
  }
  return where;
}

export async function listLeads(organizationId: string, filter: LeadFilter) {
  const where = buildWhere(organizationId, filter);

  // Cursor pagination rather than offset: the table is sorted by score, and
  // offset paging drifts as scores update underneath the operator.
  const rows = await db.lead.findMany({
    where,
    orderBy: [{ [filter.sort]: filter.direction }, { id: 'asc' }],
    take: filter.limit + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    include: {
      contacts: { where: { isPrimary: true }, take: 1 },
      owner: { select: { firstName: true, lastName: true, avatarUrl: true } },
      research: { select: { status: true, confidence: true } },
      _count: { select: { messages: true, activities: true } },
    },
  });

  const hasMore = rows.length > filter.limit;
  const items = hasMore ? rows.slice(0, filter.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

export async function countLeads(organizationId: string, filter: LeadFilter) {
  return db.lead.count({ where: buildWhere(organizationId, filter) });
}

/** Facet values for the filter sidebar, scoped to the tenant's own data. */
export async function leadFacets(organizationId: string) {
  const [industries, cities, regions, statuses] = await Promise.all([
    db.lead.groupBy({ by: ['industry'], where: { organizationId, deletedAt: null, industry: { not: null } }, _count: true, orderBy: { _count: { industry: 'desc' } }, take: 30 }),
    db.lead.groupBy({ by: ['city'], where: { organizationId, deletedAt: null, city: { not: null } }, _count: true, orderBy: { _count: { city: 'desc' } }, take: 30 }),
    db.lead.groupBy({ by: ['region'], where: { organizationId, deletedAt: null, region: { not: null } }, _count: true, orderBy: { _count: { region: 'desc' } }, take: 20 }),
    db.lead.groupBy({ by: ['status'], where: { organizationId, deletedAt: null }, _count: true }),
  ]);
  return {
    industries: industries.map((i) => ({ value: i.industry!, count: i._count })),
    cities: cities.map((c) => ({ value: c.city!, count: c._count })),
    regions: regions.map((r) => ({ value: r.region!, count: r._count })),
    statuses: statuses.map((s) => ({ value: s.status, count: s._count })),
  };
}

export const leadInputSchema = z.object({
  companyName: z.string().min(1).max(200),
  websiteUrl: z.string().max(300).optional().nullable(),
  linkedinUrl: z.string().max(300).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  industry: z.string().max(80).optional().nullable(),
  employeeCount: z.number().int().min(0).max(100000).optional().nullable(),
  employeeRange: z.string().max(40).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  region: z.string().max(80).optional().nullable(),
  country: z.string().max(80).default('CA'),
  techStack: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  notes: z.string().max(5000).optional().nullable(),
  source: z.enum(['MANUAL', 'CSV_IMPORT', 'GOOGLE_PLACES', 'OPENCORPORATES', 'COMPANY_WEBSITE', 'LINKEDIN', 'APOLLO', 'REFERRAL', 'INBOUND', 'OTHER']).default('MANUAL'),
  contact: z.object({
    firstName: z.string().max(80).optional().nullable(),
    lastName: z.string().max(80).optional().nullable(),
    title: z.string().max(120).optional().nullable(),
    email: z.string().email().optional().nullable(),
    phone: z.string().max(40).optional().nullable(),
    role: z.enum(['OWNER', 'DECISION_MAKER', 'OPERATIONS', 'FINANCE', 'IT', 'OFFICE_MANAGER', 'OTHER']).default('OTHER'),
    sourceUrl: z.string().max(300).optional().nullable(),
  }).optional(),
});
export type LeadInput = z.infer<typeof leadInputSchema>;

export async function createLead(organizationId: string, userId: string | null, input: LeadInput) {
  const domain = toDomain(input.websiteUrl);

  return db.$transaction(async (tx) => {
    // Dedupe on domain. Without a website we fall back to name + city, which is
    // imperfect but catches the common double-import case.
    const existing = domain
      ? await tx.lead.findFirst({ where: { organizationId, domain } })
      : await tx.lead.findFirst({
          where: { organizationId, companyName: { equals: input.companyName, mode: 'insensitive' }, city: input.city ?? null },
        });
    if (existing) return { lead: existing, duplicate: true as const };

    const { score, signals } = scoreLead({
      industry: input.industry ?? null,
      employeeCount: input.employeeCount ?? null,
      employeeRange: input.employeeRange ?? null,
      websiteUrl: input.websiteUrl ?? null,
      linkedinUrl: input.linkedinUrl ?? null,
      techStack: input.techStack,
      city: input.city ?? null,
      region: input.region ?? null,
      hasVerifiedEmail: false,
      hasDecisionMaker: input.contact?.role === 'OWNER' || input.contact?.role === 'DECISION_MAKER',
      research: null,
    });

    const lead = await tx.lead.create({
      data: {
        organizationId,
        companyName: input.companyName,
        websiteUrl: input.websiteUrl ?? null,
        domain,
        linkedinUrl: input.linkedinUrl ?? null,
        phone: input.phone ?? null,
        industry: input.industry ?? null,
        employeeCount: input.employeeCount ?? null,
        employeeRange: input.employeeRange ?? null,
        city: input.city ?? null,
        region: input.region ?? null,
        country: input.country,
        techStack: input.techStack,
        tags: input.tags,
        notes: input.notes ?? null,
        source: input.source,
        ownerId: userId,
        score,
        scoreBreakdown: signals as never,
        temperature: temperatureFor(score),
        ...(input.contact?.email || input.contact?.firstName
          ? { contacts: { create: { organizationId, ...input.contact, isPrimary: true } } }
          : {}),
      },
    });

    await logActivity({
      organizationId, leadId: lead.id, userId, type: 'SYSTEM',
      title: 'Lead added', body: `Source: ${input.source.toLowerCase().replace(/_/g, ' ')}`, tx,
    });

    return { lead, duplicate: false as const };
  });
}

/** Recomputes the score from current data — called after research and enrichment. */
export async function rescoreLead(leadId: string) {
  const lead = await db.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { contacts: true, research: true },
  });
  const { score, signals } = scoreLead({
    ...lead,
    hasVerifiedEmail: lead.contacts.some((c) => c.email && ['VALID', 'CATCH_ALL'].includes(c.emailVerification)),
    hasDecisionMaker: lead.contacts.some((c) => c.role === 'OWNER' || c.role === 'DECISION_MAKER'),
    research: lead.research,
  });
  return db.lead.update({
    where: { id: leadId },
    data: { score, scoreBreakdown: signals as never, temperature: temperatureFor(score) },
  });
}
