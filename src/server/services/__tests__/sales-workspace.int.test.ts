import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { dbTestsAllowed } from '@/test/db';
import { systemAccess } from '@/server/access/scope';
import { appRouter } from '@/server/trpc/routers/_app';
import type { Session } from '@/lib/auth';
import { contactFilterSchema, listContacts } from '../contacts';
import { listQueue } from '../call-queue';
const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
describe.skipIf(!reachable)('sales workspace boundaries (Postgres)', () => {
  const orgId = randomUUID();
  let clientId: string, otherClientId: string, accountId: string, contactId: string;
  const access = systemAccess(orgId);
  const session: Session = { userId: randomUUID(), clerkUserId: 'synthetic-sales-user', organizationId: orgId, organizationSlug: 'synthetic-sales', role: 'OPERATOR', clientId: null, clientIds: [], isInternal: true, email: 'sales@synthetic.test', name: 'Synthetic Sales' };
  const caller = () => appRouter.createCaller({ db, headers: new Headers(), session });
  beforeAll(async () => {
    await db.organization.create({ data: { id: orgId, clerkOrgId: `sales-${orgId}`, name: 'Synthetic Sales', slug: `sales-${orgId}` } });
    clientId = (await db.client.create({ data: { organizationId: orgId, name: 'First client', slug: `first-${orgId}` } })).id;
    otherClientId = (await db.client.create({ data: { organizationId: orgId, name: 'Other client', slug: `other-${orgId}` } })).id;
    accountId = (await db.account.create({ data: { organizationId: orgId, clientId, name: 'Synthetic Prospect', phone: '+19055550101' } })).id;
    contactId = (await db.contact.create({ data: { organizationId: orgId, clientId, accountId, firstName: 'Synthetic', lastName: 'Buyer' } })).id;
  });
  afterAll(async () => { await db.organization.delete({ where: { id: orgId } }); await db.$disconnect(); });
  it('keeps a low-priority promised callback ahead of a full page of high-fit calls', async () => {
    const high = await db.contact.create({ data: { organizationId: orgId, clientId, accountId, firstName: 'High', phone: '+19055550102' } });
    await db.callTask.createMany({ data: [
      { organizationId: orgId, clientId, accountId, contactId, category: 'CALLBACK_DUE', reasons: [], priority: 1, dueAt: new Date(Date.now() - 60000) },
      { organizationId: orgId, clientId, accountId, contactId: high.id, category: 'HIGH_FIT', reasons: [], priority: 100 },
    ] });
    const queue = await listQueue(access, { clientId, assignee: 'all', limit: 1 });
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.contactId).toBe(contactId);
  });
  it('finds an available company line without inventing a direct contact number', async () => {
    const unlinked = await db.account.create({ data: { organizationId: orgId, clientId, name: 'No person found yet', phone: '+19055550199' } });
    const business = await caller().contacts.businessLines({ clientId });
    expect(business.items.find(a => a.id === unlinked.id)?.phone).toBe('+19055550199');
    const rows = await listContacts(access, contactFilterSchema.parse({ clientId, hasPhone: true }));
    const buyer = rows.items.find(c => c.id === contactId);
    expect(buyer?.phone).toBeNull();
    expect(buyer?.account.phone).toBe('+19055550101');
    await db.account.update({ where: { id: accountId }, data: { doNotContact: true } });
    expect((await listContacts(access, contactFilterSchema.parse({ clientId, hasPhone: true }))).items).toEqual([]);
    await db.account.update({ where: { id: accountId }, data: { doNotContact: false } });
  });
  it('returns message state honestly and keeps client filtering and roles enforced', async () => {
    for (const id of [clientId, otherClientId]) {
      const account = id === clientId ? { id: accountId } : await db.account.create({ data: { organizationId: orgId, clientId: id, name: 'Other prospect' } });
      await db.message.create({ data: { organizationId: orgId, clientId: id, accountId: account.id, status: 'DRAFT', subject: id === clientId ? 'First draft' : 'Other draft' } });
    }
    const history = await caller().messages.history({ clientId, limit: 25 });
    expect(history.items).toHaveLength(1);
    expect(history.items[0]).toMatchObject({ subject: 'First draft', status: 'DRAFT', sentAt: null });
    const outsider = appRouter.createCaller({ db, headers: new Headers(), session: { ...session, organizationId: randomUUID() } });
    expect((await outsider.messages.history({ limit: 25 })).items).toEqual([]);
    const restricted = appRouter.createCaller({ db, headers: new Headers(), session: { ...session, role: 'CALLER' } });
    await expect(restricted.messages.history({ limit: 25 })).rejects.toThrow('Requires message:read');
  });
});
