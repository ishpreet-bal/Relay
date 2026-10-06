import type { Role } from '@prisma/client';
import { isInternalRole } from '@/lib/rbac';
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
}): AccessContext {
  return {
    organizationId: session.organizationId,
    userId: session.userId,
    role: session.role,
    clients: isInternalRole(session.role)
      ? { kind: 'all' }
      : { kind: 'clients', ids: session.clientId ? [session.clientId] : [] },
  };
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
