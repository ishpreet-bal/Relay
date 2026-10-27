import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { PortalNav } from '@/components/portal/portal-nav';

/**
 * The client portal: results, meetings, campaigns and the business profile.
 * A curated, read-mostly view — no internal operations, providers, costs or
 * staff notes are reachable from here.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  if (!can(session.role, 'portal:read')) redirect(session.role === 'CALLER' ? '/calls' : '/dashboard');

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-surface border-b border-hairline">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="h-14 flex items-center gap-3">
            <div className="size-6 rounded bg-accent grid place-items-center text-white font-display text-[13px] font-bold">R</div>
            <span className="font-display font-semibold tracking-display flex-1">Relay</span>
            {session.isInternal && <Link href="/clients" className="btn-ghost h-8 text-micro">Back to workspace</Link>}
            <UserButton />
          </div>
          <Suspense><PortalNav /></Suspense>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6">{children}</main>
    </div>
  );
}
