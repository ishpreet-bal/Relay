import { notFound } from 'next/navigation';
import { pageSession, portalTarget } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { db } from '@/lib/db';
import { PortalGate, ViewAsBanner } from '@/components/portal/portal-gate';
import { PortalApp } from '@/components/portal/portal-apps';

export const metadata = { title: 'Application' };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ clientId?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const session = await pageSession('portal:read');
  const { clientId, viewAs } = await portalTarget(session, (await searchParams).clientId);
  if (!clientId) return <PortalGate session={session} path={`/portal/apps/${id}`} />;
  // The application must belong to the client being shown.
  if (!(await db.clientApplication.count({ where: { id, clientId, organizationId: session.organizationId } }))) notFound();
  const viewing = viewAs ? await db.client.findUnique({ where: { id: clientId }, select: { name: true } }) : null;
  return (
    <>
      {viewing && <ViewAsBanner name={viewing.name} />}
      {/* Staff viewing as the customer see it read-only. */}
      <PortalApp id={id} viewAs={viewAs ? clientId : null} canRun={!viewAs && can(session.role, 'studio:run')} />
    </>
  );
}
