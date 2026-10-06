import { z } from 'zod';
import { clerkClient } from '@clerk/nextjs/server';
import type { Role } from '@prisma/client';
import { db } from '@/lib/db';
import { isInternalRole } from '@/lib/rbac';
import type { AccessContext } from '@/server/access/scope';
import { DomainError, NotFoundError } from '@/server/errors';

/**
 * Who works in the workspace and in what capacity. Clerk owns identity;
 * Relay owns roles. A role change here is the only way access changes —
 * Clerk role syncs never touch it (see the Clerk webhook).
 */

export const ROLES = ['SUPER_ADMIN', 'RELAY_ADMIN', 'OPERATOR', 'ANALYST', 'CALLER', 'CLIENT_ADMIN', 'CLIENT_MEMBER'] as const satisfies readonly Role[];

export async function listMembers(organizationId: string) {
  return db.membership.findMany({
    where: { organizationId },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true } },
      client: { select: { id: true, name: true } },
    },
  });
}

export const memberUpdateSchema = z.object({
  membershipId: z.string().uuid(),
  role: z.enum(ROLES),
  clientId: z.string().uuid().nullish(),
});

/** Validates a role/client pair against the workspace. Shared with invitations. */
export async function validateAssignment(organizationId: string, role: Role, clientId: string | null | undefined) {
  if (isInternalRole(role)) return null;
  if (!clientId) throw new DomainError('Client roles must be assigned to a client.');
  const client = await db.client.findFirst({ where: { id: clientId, organizationId, archivedAt: null } });
  if (!client) throw new NotFoundError('Client');
  return client.id;
}

export async function updateMember(access: AccessContext, actor: { userId: string; role: Role }, raw: z.input<typeof memberUpdateSchema>) {
  const input = memberUpdateSchema.parse(raw);
  const membership = await db.membership.findFirst({ where: { id: input.membershipId, organizationId: access.organizationId } });
  if (!membership) throw new NotFoundError('Member');

  if (membership.userId === actor.userId) {
    throw new DomainError("You can't change your own role. Ask another admin.");
  }
  if ((input.role === 'SUPER_ADMIN' || membership.role === 'SUPER_ADMIN') && actor.role !== 'SUPER_ADMIN') {
    throw new DomainError('Only an owner can grant or remove the owner role.');
  }
  if (membership.role === 'SUPER_ADMIN' && input.role !== 'SUPER_ADMIN') {
    const owners = await db.membership.count({ where: { organizationId: access.organizationId, role: 'SUPER_ADMIN' } });
    if (owners <= 1) throw new DomainError('The workspace needs at least one owner.');
  }

  const clientId = await validateAssignment(access.organizationId, input.role, input.clientId);
  return db.membership.update({
    where: { id: membership.id },
    data: { role: input.role, clientId },
  });
}

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ROLES).refine((r) => r !== 'SUPER_ADMIN', 'Invite as an admin, then promote to owner.'),
  clientId: z.string().uuid().nullish(),
});

/**
 * Sends a Clerk organization invitation carrying the intended Relay role in
 * its public metadata. When the person accepts, the membership webhook reads
 * it back — after re-validating it, since metadata is only a request.
 */
export async function inviteMember(access: AccessContext, inviterClerkUserId: string, raw: z.input<typeof inviteSchema>) {
  const input = inviteSchema.parse(raw);
  const clientId = await validateAssignment(access.organizationId, input.role, input.clientId);
  const org = await db.organization.findUniqueOrThrow({ where: { id: access.organizationId }, select: { clerkOrgId: true } });

  const clerk = await clerkClient();
  const invitation = await clerk.organizations.createOrganizationInvitation({
    organizationId: org.clerkOrgId,
    emailAddress: input.email,
    inviterUserId: inviterClerkUserId,
    role: input.role === 'RELAY_ADMIN' ? 'org:admin' : 'org:member',
    publicMetadata: { relayRole: input.role, ...(clientId ? { clientId } : {}) },
  });
  return { id: invitation.id, email: input.email, role: input.role };
}

/**
 * The role a new membership starts with. Least privilege by default: the
 * first member owns the workspace, an invitation's requested role is honoured
 * if it is valid, Clerk org admins become admins, everyone else is a client
 * member with no client — which grants nothing until an admin assigns one.
 */
export async function initialAssignment(organizationId: string, clerkRole: unknown, metadata: unknown): Promise<{ role: Role; clientId: string | null }> {
  const existing = await db.membership.count({ where: { organizationId } });
  if (existing === 0) return { role: 'SUPER_ADMIN', clientId: null };

  const meta = (metadata ?? {}) as { relayRole?: unknown; clientId?: unknown };
  const requested = ROLES.find((r) => r === meta.relayRole);
  if (requested && requested !== 'SUPER_ADMIN') {
    try {
      const clientId = await validateAssignment(organizationId, requested, typeof meta.clientId === 'string' ? meta.clientId : null);
      return { role: requested, clientId };
    } catch {
      // An invitation pointing at a client that no longer exists falls through.
    }
  }
  if (clerkRole === 'org:admin') return { role: 'RELAY_ADMIN', clientId: null };
  return { role: 'CLIENT_MEMBER', clientId: null };
}
