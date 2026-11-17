import type { Role } from '@prisma/client';
import { can, isInternalRole, SCOPABLE_ROLES, WORKSPACE_WIDE, type Permission } from '@/lib/rbac';
import { NotFoundError } from '@/server/errors';

/**
 * Tenant isolation, as a value.
 *
 * Every query for client-owned data goes through `clientFilter`, which
 * produces the where-fragment that pins it to the caller's workspace and to
 * the clients they may see. Internal staff see every client in their
 * workspace; a client user sees exactly one; a client user who has not been
 * assigned a client sees nothing. There is no code path that produces an
 * unscoped filter.
 */

export type ClientScope =
  | { kind: 'all' }
  | { kind: 'clients'; ids: readonly string[] };

export interface AccessContext {
  organizationId: string;
  userId: string;
  role: Role;
  clients: ClientScope;
}

export function accessFrom(session: {
  organizationId: string;
  userId: string;
  role: Role;
  clientId: string | null;
  /** Clients a scopable staff member is limited to; empty or absent means all. */
  clientIds?: readonly string[];
}): AccessContext {
  const limited = SCOPABLE_ROLES.includes(session.role) && (session.clientIds?.length ?? 0) > 0;
  return {
    organizationId: session.organizationId,
    userId: session.userId,
    role: session.role,
    clients: !isInternalRole(session.role)
      ? { kind: 'clients', ids: session.clientId ? [session.clientId] : [] }
      : limited ? { kind: 'clients', ids: [...new Set(session.clientIds)] } : { kind: 'all' },
  };
}

/** True for staff limited to some clients. */
export function isLimitedStaff(access: AccessContext): boolean {
  return isInternalRole(access.role) && access.clients.kind === 'clients';
}

/**
 * The permission check that also knows about client limits: staff limited to
 * some clients never get workspace-wide powers, whatever their role.
 */
export function accessCan(access: AccessContext, permission: Permission): boolean {
  if (!can(access.role, permission)) return false;
  return !(isLimitedStaff(access) && WORKSPACE_WIDE.has(permission));
}

/**
 * Where-fragment for rows that belong to a client only through their account
 * (legacy proposals and demo sites). Staff limited to some clients see rows
 * whose account is one of theirs, never rows without an account.
 */
export function viaAccount(access: AccessContext): { account?: { clientId: { in: string[] } } } {
  if (access.clients.kind === 'all') return {};
  return { account: { clientId: { in: [...access.clients.ids] } } };
}

/** Where-fragment for the Client table itself (its own id, not a clientId column). */
export function clientRowFilter(access: AccessContext): { organizationId: string; id?: { in: string[] } } {
  if (access.clients.kind === 'all') return { organizationId: access.organizationId };
  return { organizationId: access.organizationId, id: { in: [...access.clients.ids] } };
}

/** A worker or webhook acting on behalf of one workspace. */
export function systemAccess(organizationId: string): AccessContext {
  return { organizationId, userId: 'system', role: 'SUPER_ADMIN', clients: { kind: 'all' } };
}

export function canAccessClient(access: AccessContext, clientId: string): boolean {
  return access.clients.kind === 'all' || access.clients.ids.includes(clientId);
}

export function assertClientAccess(access: AccessContext, clientId: string): void {
  if (!canAccessClient(access, clientId)) throw new NotFoundError('Client');
}

export interface ClientWhere {
  organizationId: string;
  clientId?: string | { in: string[] };
}

/**
 * Where-fragment for client-owned rows. Pass `clientId` to narrow to one
 * client (for example the client picked in the switcher); asking for a client
 * outside the caller's scope is treated as not found, never as "all".
 */
export function clientFilter(access: AccessContext, clientId?: string | null): ClientWhere {
  if (clientId) {
    assertClientAccess(access, clientId);
    return { organizationId: access.organizationId, clientId };
  }
  if (access.clients.kind === 'all') return { organizationId: access.organizationId };
  return { organizationId: access.organizationId, clientId: { in: [...access.clients.ids] } };
}

/** True when the caller can see nothing at all (an unassigned client user). */
export function hasNoClientAccess(access: AccessContext): boolean {
  return access.clients.kind === 'clients' && access.clients.ids.length === 0;
}
