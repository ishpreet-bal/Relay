import { pageSession, portalTarget } from '@/lib/page-auth';
import { db } from '@/lib/db';
import { can } from '@/lib/rbac';
import { PortalGate, ViewAsBanner } from '@/components/portal/portal-gate';
import { PortalProfile } from '@/components/portal/portal-views';

export const metadata = { title: 'Your business' };

export default async function Page({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const session = await pageSession('portal:read');
  const { clientId, viewAs } = await portalTarget(session, (await searchParams).clientId);
  if (!clientId) return <PortalGate session={session} path="/portal/profile" />;
  const viewing = viewAs ? await db.client.findUnique({ where: { id: clientId }, select: { name: true } }) : null;
  return (
    <>
      {viewing && <ViewAsBanner name={viewing.name} />}
      <PortalProfile clientId={viewAs ? clientId : null} canEdit={can(session.role, 'clientProfile:write')} />
    </>
  );
}
