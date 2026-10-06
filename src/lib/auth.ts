import { auth } from '@clerk/nextjs/server';
import { cache } from 'react';
import type { Role } from '@prisma/client';
import { db } from './db';
import { assertCan, isInternalRole, type Permission } from './rbac';

export interface Session {
  userId: string;
  clerkUserId: string;
  organizationId: string;
  organizationSlug: string;
  role: Role;
  /** Set for client users; their only window into the workspace. */
  clientId: string | null;
  /** Foundry staff (admins, operators, analysts, callers). */
  isInternal: boolean;
  email: string;
  name: string;
}

/**
 * Resolves the Clerk session into a Foundry session. Cached per-request so a
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
    isInternal: internal,
    email: membership.user.email,
    name: [membership.user.firstName, membership.user.lastName].filter(Boolean).join(' ') || membership.user.email,
  };
});

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error('UNAUTHENTICATED');
  return session;
}

export async function requirePermission(permission: Permission): Promise<Session> {
  const session = await requireSession();
  assertCan(session.role, permission);
  return session;
}
