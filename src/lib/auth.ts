import { auth } from '@clerk/nextjs/server';
import { cache } from 'react';
import { db } from './db';
import { assertCan, type Permission } from './rbac';
import type { Role } from '@prisma/client';

export interface Session {
  userId: string;
  clerkUserId: string;
  organizationId: string;
  organizationSlug: string;
  role: Role;
  email: string;
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
    include: { user: true, organization: true },
  });
  if (!membership) return null;

  return {
    userId: membership.userId,
    clerkUserId,
    organizationId: membership.organizationId,
    organizationSlug: membership.organization.slug,
    role: membership.role,
    email: membership.user.email,
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
