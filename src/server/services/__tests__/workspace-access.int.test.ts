import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

/** Invite-only workspaces: who may create one, and what happens to one that may not exist. */

Object.assign(process.env, {
  APP_URL: 'http://localhost:3000', CLERK_SECRET_KEY: 'sk_test_clerk_placeholder', CLERK_WEBHOOK_SECRET: 'whsec_placeholder',
  ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'), UNSUBSCRIBE_SIGNING_KEY: 'unit-test-unsubscribe-signing-key-0123456789', CRON_SECRET: 'unit-test-cron-secret',
  WORKSPACE_CREATOR_EMAILS: 'Founder@Relay.test, second@relay.test',
});
delete process.env.SIGNUP_MODE;

const { dbTestsAllowed } = await import('@/test/db');
const { db } = await import('@/lib/db');
const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
const { creatorAllowlist, decideWorkspaceCreation, mirrorOrganization } = await import('../workspace-access');

describe('workspace creation rule', () => {
  const base = { mode: 'invite_only' as const, liveWorkspaces: 1, email: 'stranger@example.com', allowlist: ['founder@relay.test'] };
  it('refuses a stranger once a workspace exists', () => {
    expect(decideWorkspaceCreation(base)).toEqual({ allowed: false, reason: 'INVITE_ONLY' });
    expect(decideWorkspaceCreation({ ...base, email: null })).toEqual({ allowed: false, reason: 'INVITE_ONLY' });
  });
  it('allows the first workspace, an allowlisted address (any letter case), and open mode', () => {
    expect(decideWorkspaceCreation({ ...base, liveWorkspaces: 0 })).toEqual({ allowed: true, reason: 'FIRST_WORKSPACE' });
    expect(decideWorkspaceCreation({ ...base, email: ' Founder@Relay.TEST ' })).toEqual({ allowed: true, reason: 'ALLOWLISTED' });
    expect(decideWorkspaceCreation({ ...base, mode: 'open' })).toEqual({ allowed: true, reason: 'OPEN' });
  });
  it('reads the allowlist tolerantly', () => {
    expect(creatorAllowlist(' A@x.com,,b@x.com ,')).toEqual(['a@x.com', 'b@x.com']);
    expect(creatorAllowlist('')).toEqual([]);
  });
});

describe.skipIf(!reachable)('mirroring Clerk organizations (Postgres)', () => {
  const tag = randomUUID();
  const existingOrg = randomUUID();
  const ids: string[] = [];
  beforeAll(async () => {
    // At least one live workspace exists, as in production.
    await db.organization.create({ data: { id: existingOrg, clerkOrgId: `live-${tag}`, name: 'Existing', slug: `live-${tag}` } });
    await db.user.create({ data: { clerkUserId: `stranger-${tag}`, email: `stranger-${tag}@example.com` } });
    await db.user.create({ data: { clerkUserId: `founder-${tag}`, email: 'founder@relay.test' } }).catch(() => db.user.update({ where: { email: 'founder@relay.test' }, data: { clerkUserId: `founder-${tag}` } }));
  });
  afterAll(async () => {
    await db.organization.deleteMany({ where: { OR: [{ id: existingOrg }, { clerkOrgId: { in: ids } }] } });
    await db.user.deleteMany({ where: { clerkUserId: { in: [`stranger-${tag}`, `founder-${tag}`] } } });
    await db.$disconnect();
  });

  it('records a stranger\'s workspace closed, removes it from Clerk, and never reopens it', async () => {
    const id = `org_stranger_${tag}`; ids.push(id);
    const remove = vi.fn(async () => undefined);
    expect(await mirrorOrganization({ id, name: 'Strangers Inc', slug: id, created_by: `stranger-${tag}` }, remove)).toEqual({ created: true, allowed: false });
    expect(remove).toHaveBeenCalledWith(id);
    const row = await db.organization.findUniqueOrThrow({ where: { clerkOrgId: id } });
    expect(row.deletedAt).not.toBeNull();
    // A session resolves only to a live workspace (lib/auth filters deletedAt: null).
    expect(await db.organization.count({ where: { clerkOrgId: id, deletedAt: null } })).toBe(0);
    // A later rename from Clerk must not reopen it.
    await mirrorOrganization({ id, name: 'Renamed', slug: id, created_by: `stranger-${tag}` }, remove);
    expect((await db.organization.findUniqueOrThrow({ where: { clerkOrgId: id } })).deletedAt).not.toBeNull();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('still records the refusal when Clerk cleanup fails', async () => {
    const id = `org_fail_${tag}`; ids.push(id);
    const result = await mirrorOrganization({ id, name: 'Cleanup fails', slug: id, created_by: null }, async () => { throw new Error('Clerk unavailable'); });
    expect(result.allowed).toBe(false);
    expect((await db.organization.findUniqueOrThrow({ where: { clerkOrgId: id } })).deletedAt).not.toBeNull();
  });

  it('lets an allowlisted creator open a live workspace', async () => {
    const id = `org_founder_${tag}`; ids.push(id);
    const remove = vi.fn(async () => undefined);
    expect(await mirrorOrganization({ id, name: 'Second workspace', slug: id, created_by: `founder-${tag}` }, remove)).toEqual({ created: true, allowed: true });
    expect(remove).not.toHaveBeenCalled();
    expect((await db.organization.findUniqueOrThrow({ where: { clerkOrgId: id } })).deletedAt).toBeNull();
  });
});
