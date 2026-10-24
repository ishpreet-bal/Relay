import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { can } from '@/lib/rbac';
import { PROSPECTING_CLIENT_KINDS } from '@/lib/domain';
import { getActiveClientId } from '@/lib/page-auth';
import { accessFrom, clientFilter } from '@/server/access/scope';
import { Sidebar, MobileNav } from '@/components/shell/sidebar';
import { ActiveClientProvider } from '@/components/shell/active-client';

/**
 * The internal workspace, for Relay staff. Client users are sent to their
 * portal; nothing under this layout is reachable without an internal role.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/sign-in');
  if (!session.isInternal) redirect('/portal');

  const access = accessFrom(session);
  const activeClientId = await getActiveClientId(session);
  const scope = clientFilter(access, activeClientId);

  const [clients, review, calls, duplicates, inquiries] = await Promise.all([
    db.client.findMany({
      where: { organizationId: session.organizationId, archivedAt: null, kind: { in: PROSPECTING_CLIENT_KINDS } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, status: true },
    }),
    can(session.role, 'message:read')
      ? db.message.count({ where: { ...scope, direction: 'OUTBOUND', status: { in: ['DRAFT', 'NEEDS_EDIT'] } } })
      : 0,
    can(session.role, 'call:read')
      ? db.callTask.count({
          where: {
            ...scope,
            status: 'OPEN',
            ...(session.role === 'CALLER' ? { OR: [{ assigneeId: session.userId }, { assigneeId: null }] } : {}),
          },
        })
      : 0,
    can(session.role, 'account:read')
      ? db.duplicateCandidate.count({ where: { ...scope, status: 'OPEN', account: { deletedAt: null }, candidate: { deletedAt: null } } })
      : 0,
    can(session.role, 'account:read') ? db.inquiry.count({ where: { ...clientFilter(access), status: 'NEW' } }) : 0,
  ]);
  const counts = { review, calls, duplicates, inquiries };

  return (
    <ActiveClientProvider initialClientId={activeClientId} clients={clients}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar role={session.role} counts={counts} />
        <div className="flex-1 flex flex-col min-w-0">{children}</div>
        <MobileNav role={session.role} counts={counts} />
      </div>
    </ActiveClientProvider>
  );
}
