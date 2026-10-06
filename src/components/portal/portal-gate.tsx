import Link from 'next/link';
import { Eye } from 'lucide-react';
import { db } from '@/lib/db';
import type { Session } from '@/lib/auth';
import { EmptyState } from '@/components/ui/states';

/**
 * What a portal page shows before it has a client: an "access pending"
 * note for client users not yet connected to a client, or a client picker
 * for staff opening the portal to see what a client sees.
 */
export async function PortalGate({ session, path }: { session: Session; path: string }) {
  if (!session.isInternal) {
    return (
      <EmptyState title="Your access is being set up">
        You&apos;re signed in, but your account hasn&apos;t been connected to your company yet. Your Relay contact will
        finish this shortly — you don&apos;t need to do anything.
      </EmptyState>
    );
  }
  const clients = await db.client.findMany({
    where: { organizationId: session.organizationId, archivedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  return (
    <div className="card p-6 max-w-lg">
      <h1 className="text-lg font-semibold mb-1">View the portal as a client</h1>
      <p className="text-micro text-muted mb-4">See exactly what a client sees. Internal notes, costs and operations are never shown here.</p>
      <ul className="divide-y divide-hairline border border-hairline rounded-card">
        {clients.map((c) => (
          <li key={c.id}><Link href={`${path}?clientId=${c.id}`} className="block px-3 py-2 text-[13px] hover:bg-raised">{c.name}</Link></li>
        ))}
        {!clients.length && <li className="px-3 py-2 text-micro text-muted">No clients yet.</li>}
      </ul>
    </div>
  );
}

export function ViewAsBanner({ name }: { name: string }) {
  return (
    <p className="flex items-center gap-2 text-[12px] text-accent bg-accent-soft rounded-md px-3 py-2 mb-5">
      <Eye className="size-3.5" /> Viewing as {name}. This is exactly what their team sees.
    </p>
  );
}
