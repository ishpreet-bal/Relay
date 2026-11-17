import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Staff limited to chosen clients: every list and lookup they reach must
 * stay inside those clients, and workspace-wide powers must be refused.
 */

Object.assign(process.env, {
  APP_URL: 'http://localhost:3000', CLERK_SECRET_KEY: 'sk_test_clerk_placeholder', CLERK_WEBHOOK_SECRET: 'whsec_placeholder',
  ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'), UNSUBSCRIBE_SIGNING_KEY: 'unit-test-unsubscribe-signing-key-0123456789', CRON_SECRET: 'unit-test-cron-secret',
});

const { dbTestsAllowed } = await import('@/test/db');
const { db } = await import('@/lib/db');
const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
const { accessCan, accessFrom, clientRowFilter, isLimitedStaff, viaAccount } = await import('../scope');
const { accountFilterSchema, listAccounts, getAccountDetail } = await import('@/server/services/accounts');
const { contactFilterSchema, listContacts } = await import('@/server/services/contacts');
const { listClients, findClient } = await import('@/server/services/clients');
const { listOpportunities } = await import('@/server/services/delivery/opportunities');
const { listProjects } = await import('@/server/services/delivery/projects');
const { initialAssignment, updateMember, validateStaffClients } = await import('@/server/services/team');

describe('who counts as limited', () => {
  const base = { organizationId: randomUUID(), userId: randomUUID(), clientId: null };
  it('limits operators, analysts and callers only when clients are chosen', () => {
    for (const role of ['OPERATOR', 'ANALYST', 'CALLER'] as const) {
      expect(accessFrom({ ...base, role, clientIds: [] }).clients).toEqual({ kind: 'all' });
      expect(accessFrom({ ...base, role, clientIds: ['a', 'a', 'b'] }).clients).toEqual({ kind: 'clients', ids: ['a', 'b'] });
    }
  });
  it('never limits owners and admins, and keeps client users on their one client', () => {
    expect(accessFrom({ ...base, role: 'RELAY_ADMIN', clientIds: ['a'] }).clients).toEqual({ kind: 'all' });
    expect(accessFrom({ ...base, role: 'SUPER_ADMIN', clientIds: ['a'] }).clients).toEqual({ kind: 'all' });
    expect(accessFrom({ ...base, role: 'CLIENT_ADMIN', clientId: 'c', clientIds: ['a', 'b'] }).clients).toEqual({ kind: 'clients', ids: ['c'] });
  });
  it('refuses workspace-wide permissions to limited staff', () => {
    const limited = accessFrom({ ...base, role: 'ANALYST', clientIds: ['a'] });
    const open = accessFrom({ ...base, role: 'ANALYST', clientIds: [] });
    expect(isLimitedStaff(limited)).toBe(true);
    expect(accessCan(open, 'ops:read')).toBe(true);
    expect(accessCan(limited, 'ops:read')).toBe(false);
    expect(accessCan(limited, 'settings:read')).toBe(false);
    expect(accessCan(limited, 'account:read')).toBe(true);
    expect(accessCan(limited, 'research:run')).toBe(true);
  });
  it('builds filters for the Client table and account-owned rows', () => {
    const limited = accessFrom({ ...base, role: 'CALLER', clientIds: ['a'] });
    expect(clientRowFilter(limited)).toEqual({ organizationId: base.organizationId, id: { in: ['a'] } });
    expect(viaAccount(limited)).toEqual({ account: { clientId: { in: ['a'] } } });
    expect(viaAccount(accessFrom({ ...base, role: 'OPERATOR', clientIds: [] }))).toEqual({});
  });
});

describe.skipIf(!reachable)('limited staff see only their clients (Postgres)', () => {
  const orgId = randomUUID();
  let a = ''; let b = ''; let accountA = ''; let accountB = '';
  let operatorMembership = ''; let ownerUserId = '';
  const tag = randomUUID().slice(0, 8);
  beforeAll(async () => {
    await db.organization.create({ data: { id: orgId, clerkOrgId: `scope-${orgId}`, name: 'Scope test', slug: `scope-${orgId}` } });
    a = (await db.client.create({ data: { organizationId: orgId, name: 'Client A', slug: `a-${tag}` } })).id;
    b = (await db.client.create({ data: { organizationId: orgId, name: 'Client B', slug: `b-${tag}` } })).id;
    accountA = (await db.account.create({ data: { organizationId: orgId, clientId: a, name: 'Alpha Co', domain: `alpha-${tag}.test` } })).id;
    accountB = (await db.account.create({ data: { organizationId: orgId, clientId: b, name: 'Beta Co', domain: `beta-${tag}.test` } })).id;
    await db.contact.create({ data: { organizationId: orgId, clientId: a, accountId: accountA, email: `a@alpha-${tag}.test` } });
    await db.contact.create({ data: { organizationId: orgId, clientId: b, accountId: accountB, email: `b@beta-${tag}.test` } });
    for (const [clientId, accountId] of [[a, accountA], [b, accountB]] as const) {
      await db.opportunity.create({ data: { organizationId: orgId, clientId, accountId, title: `Opp ${clientId}`, problem: 'p', proposedAutomation: 'x', source: 'MANUAL' } });
      await db.deliveryProject.create({ data: { organizationId: orgId, clientId, name: `Project ${clientId}`, estimatedHours: 10 } });
    }
    const owner = await db.user.create({ data: { clerkUserId: `owner-${tag}`, email: `owner-${tag}@relay.test` } });
    const op = await db.user.create({ data: { clerkUserId: `op-${tag}`, email: `op-${tag}@relay.test` } });
    ownerUserId = owner.id;
    await db.membership.create({ data: { organizationId: orgId, userId: owner.id, role: 'SUPER_ADMIN' } });
    operatorMembership = (await db.membership.create({ data: { organizationId: orgId, userId: op.id, role: 'OPERATOR' } })).id;
  });
  afterAll(async () => {
    await db.organization.delete({ where: { id: orgId } });
    await db.user.deleteMany({ where: { clerkUserId: { in: [`owner-${tag}`, `op-${tag}`] } } });
    await db.$disconnect();
  });

  const limited = () => accessFrom({ organizationId: orgId, userId: randomUUID(), role: 'OPERATOR', clientId: null, clientIds: [a] });

  it('lists only client A across accounts, contacts, clients, opportunities and projects', async () => {
    const access = limited();
    const accounts = await listAccounts(access, accountFilterSchema.parse({}));
    expect(accounts.items.map((r: { id: string }) => r.id)).toEqual([accountA]);
    const contacts = await listContacts(access, contactFilterSchema.parse({}));
    expect(contacts.items.length === 1 && contacts.items.every((r: { email: string | null }) => r.email?.includes('alpha'))).toBe(true);
    expect((await listClients(access)).map((c) => c.id)).toEqual([a]);
    expect((await listOpportunities(access, {})).items.map((o) => o.clientId)).toEqual([a]);
    expect((await listProjects(access)).map((p) => p.clientId)).toEqual([a]);
  });

  it('treats client B records as not found, even by id', async () => {
    const access = limited();
    await expect(getAccountDetail(access, accountB)).rejects.toThrow();
    await expect(findClient(access, b)).rejects.toThrow('Client');
    await expect(listAccounts(access, accountFilterSchema.parse({ clientId: b }))).rejects.toThrow('Client');
  });

  it('lets the owner limit an operator, checks the clients, and clears the list for roles that cannot be limited', async () => {
    const access = accessFrom({ organizationId: orgId, userId: ownerUserId, role: 'SUPER_ADMIN', clientId: null, clientIds: [] });
    const actor = { userId: ownerUserId, role: 'SUPER_ADMIN' as const };
    expect((await updateMember(access, actor, { membershipId: operatorMembership, role: 'OPERATOR', clientIds: [a] })).clientIds).toEqual([a]);
    // Omitting the list keeps it.
    expect((await updateMember(access, actor, { membershipId: operatorMembership, role: 'ANALYST' })).clientIds).toEqual([a]);
    // A client from another workspace is refused.
    await expect(updateMember(access, actor, { membershipId: operatorMembership, role: 'OPERATOR', clientIds: [randomUUID()] })).rejects.toThrow('Client');
    // Admins work across every client.
    expect((await updateMember(access, actor, { membershipId: operatorMembership, role: 'RELAY_ADMIN', clientIds: [a] })).clientIds).toEqual([]);
    expect(await validateStaffClients(orgId, 'CALLER', [a, a])).toEqual([a]);
  });

  it('honours invited client lists, dropping removed clients, and never widens a limit to everything', async () => {
    const meta = (clientIds: string[]) => ({ relayRole: 'CALLER', clientIds });
    expect(await initialAssignment(orgId, 'org:member', meta([a]))).toMatchObject({ role: 'CALLER', clientIds: [a] });
    expect(await initialAssignment(orgId, 'org:member', meta([a, randomUUID()]))).toMatchObject({ role: 'CALLER', clientIds: [a] });
    // Every invited client is gone: least privilege, not "all clients".
    expect(await initialAssignment(orgId, 'org:member', meta([randomUUID()]))).toMatchObject({ role: 'CLIENT_MEMBER', clientId: null });
  });
});
