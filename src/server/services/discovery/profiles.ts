import { z } from 'zod';
import { startOfMonth } from 'date-fns';
import { db } from '@/lib/db';
import { assertClientAccess, clientFilter, type AccessContext } from '@/server/access/scope';
import { NotFoundError } from '@/server/errors';
import { nextRunAfter } from './plan';

/**
 * Discovery profiles: what to look for (categories, keywords, size), where
 * (country, provinces, cities or a radius), from which sources, how often,
 * and how much a month it may spend.
 */

export const DISCOVERY_SOURCES = ['google_places', 'apollo'] as const;
export const DISCOVERY_FREQUENCIES = ['MANUAL', 'EVERY_6_HOURS', 'DAILY', 'WEEKLY', 'MONTHLY'] as const;

const list = (maxItems: number, maxLength: number) =>
  z.array(z.string().trim().min(1).max(maxLength)).max(maxItems).default([]).transform((v) => [...new Set(v)]);

export const discoveryProfileSchema = z.object({
  clientId: z.string().uuid(),
  icpId: z.string().uuid().nullish().transform((v) => v ?? null),
  name: z.string().trim().min(1).max(120),
  isActive: z.boolean().default(true),
  sources: z.array(z.enum(DISCOVERY_SOURCES)).min(1, 'Choose at least one source').max(DISCOVERY_SOURCES.length),
  country: z.string().trim().length(2).toUpperCase().default('CA'),
  regions: list(13, 40),
  cities: list(40, 80),
  latitude: z.number().min(-90).max(90).nullish().transform((v) => v ?? null),
  longitude: z.number().min(-180).max(180).nullish().transform((v) => v ?? null),
  radiusKm: z.number().int().min(1).max(50).nullish().transform((v) => v ?? null),
  industries: list(20, 80),
  keywords: list(20, 60),
  excludeKeywords: list(40, 60),
  employeeMin: z.number().int().min(0).max(1_000_000).nullish().transform((v) => v ?? null),
  employeeMax: z.number().int().min(1).max(1_000_000).nullish().transform((v) => v ?? null),
  maxResultsPerRun: z.number().int().min(1).max(500).default(60),
  monthlyBudgetCents: z.number().int().min(0).max(1_000_000).default(2000),
  frequency: z.enum(DISCOVERY_FREQUENCIES).default('WEEKLY'),
  autoResearch: z.boolean().default(false),
})
  .refine((p) => p.industries.length + p.keywords.length > 0, { message: 'Add at least one business category or keyword', path: ['industries'] })
  .refine((p) => p.employeeMin === null || p.employeeMax === null || p.employeeMin <= p.employeeMax, { message: 'Minimum employees is above the maximum', path: ['employeeMin'] })
  .refine((p) => (p.latitude === null) === (p.longitude === null), { message: 'Give both latitude and longitude, or neither', path: ['latitude'] });

export type DiscoveryProfileInput = z.input<typeof discoveryProfileSchema>;

/** Spend this calendar month on a profile's runs, in millicents. */
export async function monthSpendMillicents(profileId: string, now = new Date()) {
  const agg = await db.discoveryRun.aggregate({
    where: { profileId, createdAt: { gte: startOfMonth(now) } },
    _sum: { costMillicents: true },
  });
  return agg._sum.costMillicents ?? 0;
}

/** 50/80/100% warning bands for a monthly budget. */
export function budgetLevel(spentMillicents: number, budgetCents: number): 'ok' | 'half' | 'high' | 'reached' {
  if (budgetCents <= 0) return spentMillicents > 0 ? 'reached' : 'ok';
  const pct = spentMillicents / (budgetCents * 1000);
  return pct >= 1 ? 'reached' : pct >= 0.8 ? 'high' : pct >= 0.5 ? 'half' : 'ok';
}

export async function listProfiles(access: AccessContext, clientId?: string | null) {
  const profiles = await db.discoveryProfile.findMany({
    where: { ...clientFilter(access, clientId), archivedAt: null },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: {
      client: { select: { id: true, name: true } },
      runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, imported: true, found: true, createdAt: true, finishedAt: true, error: true } },
    },
  });
  const spend = await db.discoveryRun.groupBy({
    by: ['profileId'],
    where: { profileId: { in: profiles.map((p) => p.id) }, createdAt: { gte: startOfMonth(new Date()) } },
    _sum: { costMillicents: true },
  });
  const byProfile = new Map(spend.map((s) => [s.profileId, s._sum.costMillicents ?? 0]));
  return profiles.map((p) => {
    const spent = byProfile.get(p.id) ?? 0;
    return { ...p, monthSpendMillicents: spent, budgetLevel: budgetLevel(spent, p.monthlyBudgetCents) };
  });
}

export async function getProfile(access: AccessContext, id: string) {
  const profile = await db.discoveryProfile.findFirst({
    where: { id, ...clientFilter(access), archivedAt: null },
    include: { client: { select: { id: true, name: true } } },
  });
  if (!profile) throw new NotFoundError('Discovery profile');
  return profile;
}

export async function createProfile(access: AccessContext, userId: string, raw: DiscoveryProfileInput) {
  const input = discoveryProfileSchema.parse(raw);
  assertClientAccess(access, input.clientId);
  await assertIcp(access, input.clientId, input.icpId);
  return db.discoveryProfile.create({
    data: {
      ...input,
      organizationId: access.organizationId,
      createdById: userId,
      // The first scheduled run comes one interval from now; "Run now" is
      // there for an immediate one, so a new profile never spends by surprise.
      nextRunAt: input.isActive ? nextRunAfter(input.frequency, new Date()) : null,
    },
  });
}

export async function updateProfile(access: AccessContext, id: string, raw: DiscoveryProfileInput) {
  const before = await getProfile(access, id);
  const input = discoveryProfileSchema.parse(raw);
  assertClientAccess(access, input.clientId);
  await assertIcp(access, input.clientId, input.icpId);
  const rescheduled = before.frequency !== input.frequency || before.isActive !== input.isActive || !before.nextRunAt;
  return db.discoveryProfile.update({
    where: { id },
    data: {
      ...input,
      ...(rescheduled ? { nextRunAt: input.isActive ? nextRunAfter(input.frequency, before.lastRunAt ?? new Date()) : null } : {}),
    },
  });
}

export async function archiveProfile(access: AccessContext, id: string) {
  await getProfile(access, id);
  return db.discoveryProfile.update({ where: { id }, data: { archivedAt: new Date(), isActive: false, nextRunAt: null } });
}

async function assertIcp(access: AccessContext, clientId: string, icpId: string | null) {
  if (!icpId) return;
  const icp = await db.idealCustomerProfile.findFirst({ where: { id: icpId, clientId, organizationId: access.organizationId }, select: { id: true } });
  if (!icp) throw new NotFoundError('Ideal customer profile');
}
