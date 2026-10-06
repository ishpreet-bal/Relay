import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { homeFor } from '@/lib/page-auth';

/** Everyone lands where their work is: staff on the dashboard, callers on the queue, clients in the portal. */
export default async function Home() {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  redirect(homeFor(session));
}
