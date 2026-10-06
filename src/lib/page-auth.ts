import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { db } from './db';
import { getSession, type Session } from './auth';
import { can, type Permission } from './rbac';

/** Where each kind of user lands. */
export function homeFor(session: Pick<Session, 'isInternal' | 'role'>) {
  if (!session.isInternal) return '/portal';
  if (session.role === 'CALLER') return '/calls';
  return '/dashboard';
}

/**
 * Page-level authorization. Signed-out users go to sign-in; signed-in users
 * without the permission go to their own home rather than an error page.
 */
export async function pageSession(permission: Permission): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  if (!can(session.role, permission)) redirect(homeFor(session));
  return session;
}

export const ACTIVE_CLIENT_COOKIE = 'fdy_client';

/**
 * The client an internal user has selected in the switcher, or null for "all
 * clients". Client users are always pinned to their own client. The cookie is
 * a preference, never an authority: it is validated on every read.
 */
export async function getActiveClientId(session: Session): Promise<string | null> {
  if (!session.isInternal) return session.clientId;
  const value = (await cookies()).get(ACTIVE_CLIENT_COOKIE)?.value;
  if (!value || !/^[0-9a-f-]{36}$/i.test(value)) return null;
  const exists = await db.client.count({ where: { id: value, organizationId: session.organizationId, archivedAt: null } });
  return exists ? value : null;
}
