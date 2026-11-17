import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Who may create a workspace. Relay is invite-only: people join a workspace
 * by invitation (staff) or are added to a client by its staff (customers).
 * Without this, anyone who signed up was offered an empty workspace of their
 * own, with every staff tool in it.
 *
 * A workspace may be created when sign-up is open, when none exists yet (the
 * first install), or by an address on WORKSPACE_CREATOR_EMAILS. The Clerk
 * webhook enforces it; the onboarding page only explains it.
 */

export type WorkspaceDecision =
  | { allowed: true; reason: 'OPEN' | 'FIRST_WORKSPACE' | 'ALLOWLISTED' }
  | { allowed: false; reason: 'INVITE_ONLY' };

export function creatorAllowlist(raw = env().WORKSPACE_CREATOR_EMAILS): string[] {
  return (raw ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function decideWorkspaceCreation(input: { mode: 'invite_only' | 'open'; liveWorkspaces: number; email: string | null; allowlist: string[] }): WorkspaceDecision {
  if (input.mode === 'open') return { allowed: true, reason: 'OPEN' };
  if (input.liveWorkspaces === 0) return { allowed: true, reason: 'FIRST_WORKSPACE' };
  if (input.email && input.allowlist.includes(input.email.trim().toLowerCase())) return { allowed: true, reason: 'ALLOWLISTED' };
  return { allowed: false, reason: 'INVITE_ONLY' };
}

export async function mayCreateWorkspace(email: string | null): Promise<WorkspaceDecision> {
  const liveWorkspaces = await db.organization.count({ where: { deletedAt: null } });
  return decideWorkspaceCreation({ mode: env().SIGNUP_MODE, liveWorkspaces, email, allowlist: creatorAllowlist() });
}

export interface ClerkOrganizationEvent { id: string; name: string; slug?: string | null; created_by?: string | null }

/**
 * Mirrors a Clerk organization into Relay. One that may not be created is
 * still recorded, already closed (deletedAt set): sessions never resolve to
 * a closed workspace, the attempt stays visible, and its membership events
 * have something to attach to instead of retrying forever. `removeFromClerk`
 * then deletes the Clerk organization, best effort.
 */
export async function mirrorOrganization(d: ClerkOrganizationEvent, removeFromClerk: (clerkOrgId: string) => Promise<unknown> = async () => undefined) {
  const existing = await db.organization.findUnique({ where: { clerkOrgId: d.id }, select: { id: true } });
  if (existing) {
    // Renames only. A closed workspace is never reopened by an update event.
    await db.organization.update({ where: { id: existing.id }, data: { name: d.name, slug: d.slug ?? d.id } });
    return { created: false as const, allowed: true as const };
  }
  const creator = d.created_by ? await db.user.findUnique({ where: { clerkUserId: d.created_by }, select: { email: true } }) : null;
  const decision = await mayCreateWorkspace(creator?.email ?? null);
  await db.organization.create({
    data: {
      clerkOrgId: d.id, name: d.name, slug: d.slug ?? d.id, brandName: d.name,
      trialEndsAt: new Date(Date.now() + 14 * 864e5),
      ...(decision.allowed ? {} : { deletedAt: new Date() }),
    },
  });
  if (!decision.allowed) {
    logger.warn('workspace.creation_refused', { clerkOrgId: d.id, createdBy: d.created_by ?? null });
    await removeFromClerk(d.id).catch((err) => logger.warn('workspace.clerk_cleanup_failed', { clerkOrgId: d.id, error: err }));
  }
  return { created: true as const, allowed: decision.allowed };
}
