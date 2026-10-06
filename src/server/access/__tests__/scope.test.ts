import { describe, it, expect } from 'vitest';
import { accessFrom, clientFilter, canAccessClient, hasNoClientAccess } from '../scope';
import { NotFoundError } from '@/server/errors';
import { can } from '@/lib/rbac';

const ORG = 'org-1';
const A = 'client-a';
const B = 'client-b';

describe('access scope', () => {
  it('lets internal staff see every client in their workspace', () => {
    const access = accessFrom({ organizationId: ORG, userId: 'u', role: 'OPERATOR', clientId: null });
    expect(clientFilter(access)).toEqual({ organizationId: ORG });
    expect(clientFilter(access, A)).toEqual({ organizationId: ORG, clientId: A });
  });

  it('ignores a stray clientId on an internal membership', () => {
    const access = accessFrom({ organizationId: ORG, userId: 'u', role: 'CALLER', clientId: A });
    expect(canAccessClient(access, B)).toBe(true);
  });

  it('pins a client user to their own client', () => {
    const access = accessFrom({ organizationId: ORG, userId: 'u', role: 'CLIENT_ADMIN', clientId: A });
    expect(clientFilter(access)).toEqual({ organizationId: ORG, clientId: { in: [A] } });
    expect(clientFilter(access, A)).toEqual({ organizationId: ORG, clientId: A });
  });

  it('treats a request for another client as not found', () => {
    const access = accessFrom({ organizationId: ORG, userId: 'u', role: 'CLIENT_MEMBER', clientId: A });
    expect(() => clientFilter(access, B)).toThrow(NotFoundError);
  });

  it('gives an unassigned client user an empty scope, not the whole workspace', () => {
    const access = accessFrom({ organizationId: ORG, userId: 'u', role: 'CLIENT_MEMBER', clientId: null });
    expect(hasNoClientAccess(access)).toBe(true);
    expect(clientFilter(access)).toEqual({ organizationId: ORG, clientId: { in: [] } });
  });
});

describe('role permissions', () => {
  it('keeps client users out of internal operations', () => {
    for (const role of ['CLIENT_ADMIN', 'CLIENT_MEMBER'] as const) {
      expect(can(role, 'account:read')).toBe(false);
      expect(can(role, 'message:read')).toBe(false);
      expect(can(role, 'ops:read')).toBe(false);
      expect(can(role, 'connector:manage')).toBe(false);
      expect(can(role, 'portal:read')).toBe(true);
    }
  });

  it('lets callers work the queue but not send email or change settings', () => {
    expect(can('CALLER', 'call:log')).toBe(true);
    expect(can('CALLER', 'meeting:write')).toBe(true);
    expect(can('CALLER', 'message:send')).toBe(false);
    expect(can('CALLER', 'campaign:write')).toBe(false);
    expect(can('CALLER', 'settings:write')).toBe(false);
  });

  it('keeps sending above analysts', () => {
    expect(can('ANALYST', 'message:draft')).toBe(true);
    expect(can('ANALYST', 'message:send')).toBe(false);
    expect(can('OPERATOR', 'message:send')).toBe(true);
  });

  it('reserves billing for the owner', () => {
    expect(can('SUPER_ADMIN', 'billing:manage')).toBe(true);
    expect(can('RELAY_ADMIN', 'billing:manage')).toBe(false);
  });
});
