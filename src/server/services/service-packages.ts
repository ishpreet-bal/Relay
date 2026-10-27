import { z } from 'zod';
import { db } from '@/lib/db';
import { costBreakdown } from '@/lib/cost-model';
import { NotFoundError } from '@/server/errors';
import type { AccessContext } from '@/server/access/scope';

/**
 * Internal cost models for service packages. Prices on the public website
 * are never generated from these: they inform quotes a person writes.
 */

const cents = z.number().int().min(0).max(100_000_000);
const hours = z.number().min(0).max(10_000);

export const packageSchema = z.object({
  service: z.enum(['AUTOMATION', 'ACQUISITION', 'WEBSITES']),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).nullish(),
  buildHours: hours,
  setupCostCents: cents,
  hostingCents: cents,
  databaseCents: cents,
  aiCents: cents,
  thirdPartyCents: cents,
  domainCents: cents,
  monitoringCents: cents,
  supportHours: hours,
  maintenanceHours: hours,
  targetMarginPct: z.number().int().min(0).max(95),
  priceSetupCents: cents.nullish(),
  priceMonthlyCents: cents.nullish(),
  includedUsage: z.string().trim().max(300).nullish(),
  notes: z.string().trim().max(4000).nullish(),
});
export type PackageInput = z.input<typeof packageSchema>;

export async function listPackages(access: AccessContext) {
  const [org, packages] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: access.organizationId }, select: { internalHourlyCostCents: true, currency: true } }),
    db.servicePackage.findMany({ where: { organizationId: access.organizationId }, orderBy: [{ service: 'asc' }, { name: 'asc' }] }),
  ]);
  return {
    hourlyCostCents: org.internalHourlyCostCents,
    currency: org.currency,
    packages: packages.map((p) => ({ ...p, cost: costBreakdown(p, org.internalHourlyCostCents) })),
  };
}

export async function savePackage(access: AccessContext, id: string | null, raw: PackageInput) {
  const data = packageSchema.parse(raw);
  if (!id) return db.servicePackage.create({ data: { ...data, organizationId: access.organizationId } });
  const existing = await db.servicePackage.findFirst({ where: { id, organizationId: access.organizationId }, select: { id: true } });
  if (!existing) throw new NotFoundError('Package');
  return db.servicePackage.update({ where: { id }, data });
}

export async function deletePackage(access: AccessContext, id: string) {
  const { count } = await db.servicePackage.deleteMany({ where: { id, organizationId: access.organizationId } });
  if (!count) throw new NotFoundError('Package');
}

const ASSUMPTION = 'Starting assumptions, not measured costs: replace each figure with your own before quoting.';

/**
 * One package per offering on the website, with planning assumptions to
 * edit. Adds only the ones missing, so it never overwrites real numbers.
 */
export const STARTING_PACKAGES: (PackageInput & { name: string })[] = [
  { service: 'WEBSITES', name: 'Website: Launch', description: 'Professional website, contact form, domain, hosting, business email, search foundations and analytics.',
    buildHours: 20, setupCostCents: 0, hostingCents: 500, databaseCents: 0, aiCents: 0, thirdPartyCents: 0, domainCents: 1100, monitoringCents: 100,
    supportHours: 0.5, maintenanceHours: 1, targetMarginPct: 45, includedUsage: 'One business email mailbox; small content changes each month.', notes: ASSUMPTION },
  { service: 'WEBSITES', name: 'Website: Bookings', description: 'Everything in Launch, plus online booking, confirmations and reminders, and inquiry management.',
    buildHours: 32, setupCostCents: 0, hostingCents: 500, databaseCents: 0, aiCents: 0, thirdPartyCents: 1500, domainCents: 1100, monitoringCents: 100,
    supportHours: 1, maintenanceHours: 1.5, targetMarginPct: 45, includedUsage: 'Booking and reminders for one location.', notes: ASSUMPTION },
  { service: 'WEBSITES', name: 'Website: Foundation', description: 'Everything in Bookings, plus a basic CRM, simple follow-up workflows and simple e-commerce where it fits.',
    buildHours: 48, setupCostCents: 0, hostingCents: 800, databaseCents: 0, aiCents: 0, thirdPartyCents: 2500, domainCents: 1100, monitoringCents: 200,
    supportHours: 1.5, maintenanceHours: 2, targetMarginPct: 45, includedUsage: 'Up to three staff users in the CRM.', notes: ASSUMPTION },
  { service: 'ACQUISITION', name: 'Customer acquisition: managed', description: 'Discovery, research, qualification, CRM organization and outreach prepared for approval, run monthly.',
    buildHours: 16, setupCostCents: 0, hostingCents: 1000, databaseCents: 500, aiCents: 1500, thirdPartyCents: 4000, domainCents: 0, monitoringCents: 200,
    supportHours: 2, maintenanceHours: 6, targetMarginPct: 50, includedUsage: 'An agreed number of researched prospects each month.', notes: ASSUMPTION },
  { service: 'AUTOMATION', name: 'Automation: single workflow', description: 'One custom workflow, connected to the client’s existing systems, hosted and monitored.',
    buildHours: 60, setupCostCents: 0, hostingCents: 1500, databaseCents: 1000, aiCents: 2000, thirdPartyCents: 0, domainCents: 0, monitoringCents: 500,
    supportHours: 2, maintenanceHours: 3, targetMarginPct: 45, includedUsage: 'An agreed monthly volume of runs or documents.', notes: ASSUMPTION },
];

export async function addStartingPackages(access: AccessContext) {
  const existing = new Set((await db.servicePackage.findMany({ where: { organizationId: access.organizationId }, select: { name: true } })).map((p) => p.name));
  const missing = STARTING_PACKAGES.filter((p) => !existing.has(p.name));
  for (const p of missing) await db.servicePackage.create({ data: { ...packageSchema.parse(p), organizationId: access.organizationId } });
  return { added: missing.length };
}
