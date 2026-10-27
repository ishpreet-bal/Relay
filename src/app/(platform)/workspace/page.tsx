import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { homeFor } from '@/lib/page-auth';

/**
 * Where signing in lands, now that / is the public website: staff on the
 * dashboard, callers on the queue, clients in the portal.
 */
export default async function Workspace() {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  redirect(homeFor(session));
}
