import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

/** Service package cost models are per workspace, and starting packages never overwrite real numbers. */

const { dbTestsAllowed } = await import('@/test/db');
const { db } = await import('@/lib/db');
const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
const { addStartingPackages, listPackages, savePackage, deletePackage, STARTING_PACKAGES } = await import('../service-packages');
const { systemAccess } = await import('@/server/access/scope');

describe.skipIf(!reachable)('service packages (database)', () => {
  const orgId = randomUUID();
  const otherOrg = randomUUID();
  beforeAll(async () => {
    await db.organization.create({ data: { id: orgId, clerkOrgId: `test_${orgId}`, name: 'Packages test', slug: `pkg-${orgId.slice(0, 8)}`, internalHourlyCostCents: 5000 } });
    await db.organization.create({ data: { id: otherOrg, clerkOrgId: `test_${otherOrg}`, name: 'Other', slug: `pkg-${otherOrg.slice(0, 8)}` } });
  });
  afterAll(async () => {
    if (reachable) await db.organization.deleteMany({ where: { id: { in: [orgId, otherOrg] } } });
    await db.$disconnect();
  });

  it('adds the starting packages once, keeping edits', async () => {
    expect(await addStartingPackages(systemAccess(orgId))).toEqual({ added: STARTING_PACKAGES.length });
    const { packages } = await listPackages(systemAccess(orgId));
    const launch = packages.find((p) => p.name === 'Website: Launch')!;
    await savePackage(systemAccess(orgId), launch.id, { ...STARTING_PACKAGES[0]!, buildHours: 12 });
    expect(await addStartingPackages(systemAccess(orgId))).toEqual({ added: 0 });
    const after = await listPackages(systemAccess(orgId));
    const edited = after.packages.find((p) => p.id === launch.id)!;
    expect(edited.buildHours).toBe(12);
    expect(edited.cost.setup.labourCents).toBe(12 * 5000);
    expect(after.hourlyCostCents).toBe(5000);
  });

  it('keeps each workspace’s packages to itself', async () => {
    const { packages } = await listPackages(systemAccess(orgId));
    await expect(savePackage(systemAccess(otherOrg), packages[0]!.id, STARTING_PACKAGES[0]!)).rejects.toThrow(/not found/);
    await expect(deletePackage(systemAccess(otherOrg), packages[0]!.id)).rejects.toThrow(/not found/);
    expect((await listPackages(systemAccess(otherOrg))).packages).toEqual([]);
  });
});
