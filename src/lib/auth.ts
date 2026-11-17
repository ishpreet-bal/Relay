import { auth } from '@clerk/nextjs/server';
import { cache } from 'react';
import type { Role } from '@prisma/client';
import { db } from './db';
import { assertCan, ForbiddenError, isInternalRole, type Permission } from './rbac';
import { accessCan, accessFrom } from '@/server/access/scope';

export interface Session {
  userId: string;
  clerkUserId: string;
  organizationId: string;
  organizationSlug: string;
  role: Role;
  /** Set for client users; their only window into the workspace. */
  clientId: string | null;
  /** Operators, analysts and callers limited to these clients; empty means all. */
  clientIds: string[];
  /** Relay staff (admins, operators, analysts, callers). */
  isInternal: boolean;
  email: string;
  name: string;
}

/**
 * Resolves the Clerk session into a Relay session. Cached per-request so a
 * page rendering twelve server components issues one query, not twelve.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const { userId: clerkUserId, orgId: clerkOrgId } = await auth();
  if (!clerkUserId || !clerkOrgId) return null;

  const membership = await db.membership.findFirst({
    where: { user: { clerkUserId }, organization: { clerkOrgId, deletedAt: null } },
    include: { user: true, organization: true, client: { select: { id: true, archivedAt: true } } },
  });
  if (!membership) return null;

  const internal = isInternalRole(membership.role);
  // A client user whose client was archived loses access with it.
  const clientId = !internal && membership.client && !membership.client.archivedAt
    ? membership.client.id
    : null;

  return {
    userId: membership.userId,
    clerkUserId,
    organizationId: membership.organizationId,
    organizationSlug: membership.organization.slug,
    role: membership.role,
    clientId,
    clientIds: internal ? await liveClientIds(membership.organizationId, membership.clientIds) : [],
    isInternal: internal,
    email: membership.user.email,
    name: [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email,
  };
});

/**
 * A staff member's client list without archived or removed clients. If every
 * client they were limited to is gone, they keep one impossible id rather
 * than an empty list, so they see nothing instead of everything.
 */
async function liveClientIds(organizationId: string, ids: string[]) {
  if (!ids.length) return [];
  const live = await db.client.findMany({ where: { id: { in: ids }, organizationId, archivedAt: null }, select: { id: true } });
  return live.length ? live.map((c) => c.id) : ['00000000-0000-0000-0000-000000000000'];
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error('UNAUTHENTICATED');
  return session;
}

export async function requirePermission(permission: Permission): Promise<Session> {
  const session = await requireSession();
  assertCan(session.role, permission);
  if (!accessCan(accessFrom(session), permission)) throw new ForbiddenError(permission);
  return session;
}
