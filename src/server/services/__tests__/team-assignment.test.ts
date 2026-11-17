import { describe, it, expect, vi, beforeEach } from 'vitest';

const membershipCount = vi.fn();
const clientFindFirst = vi.fn();
vi.mock('@/lib/db', () => ({ db: { membership: { count: membershipCount }, client: { findFirst: clientFindFirst } } }));
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: vi.fn() }));
const { initialAssignment } = await import('../team');

const ORG = 'org-1';

describe('initialAssignment', () => {
  beforeEach(() => {
    membershipCount.mockReset();
    clientFindFirst.mockReset();
  });

  it('makes the first member of a workspace its owner', async () => {
    membershipCount.mockResolvedValue(0);
    expect(await initialAssignment(ORG, 'org:member', {})).toEqual({ role: 'SUPER_ADMIN', clientId: null, clientIds: [] });
  });

  it('never grants owner from invitation metadata', async () => {
    membershipCount.mockResolvedValue(3);
    const result = await initialAssignment(ORG, 'org:member', { relayRole: 'SUPER_ADMIN' });
    expect(result.role).not.toBe('SUPER_ADMIN');
  });

  it('applies the invited role and client', async () => {
    membershipCount.mockResolvedValue(3);
    clientFindFirst.mockResolvedValue({ id: 'client-a' });
    expect(await initialAssignment(ORG, 'org:member', { relayRole: 'CLIENT_ADMIN', clientId: 'client-a' })).toEqual({ role: 'CLIENT_ADMIN', clientId: 'client-a', clientIds: [] });
    expect(clientFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG }) }));
  });

  it('falls back to the least-privileged role when the invited client is gone or unknown', async () => {
    membershipCount.mockResolvedValue(3);
    clientFindFirst.mockResolvedValue(null);
    expect(await initialAssignment(ORG, 'org:member', { relayRole: 'CLIENT_ADMIN', clientId: 'other-org-client' })).toEqual({ role: 'CLIENT_MEMBER', clientId: null, clientIds: [] });
    expect(await initialAssignment(ORG, 'org:member', null)).toEqual({ role: 'CLIENT_MEMBER', clientId: null, clientIds: [] });
  });

  it('maps a Clerk admin to the Relay admin role', async () => {
    membershipCount.mockResolvedValue(3);
    expect(await initialAssignment(ORG, 'org:admin', {})).toEqual({ role: 'RELAY_ADMIN', clientId: null, clientIds: [] });
  });
});
