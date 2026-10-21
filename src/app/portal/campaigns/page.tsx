import { pageSession, portalTarget } from '@/lib/page-auth';
import { db } from '@/lib/db';
import { PortalGate, ViewAsBanner } from '@/components/portal/portal-gate';
import { PortalCampaigns } from '@/components/portal/portal-views';

export const metadata = { title: 'Campaigns' };

export default async function Page({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const session = await pageSession('portal:read');
  const { clientId, viewAs } = await portalTarget(session, (await searchParams).clientId);
  if (!clientId) return <PortalGate session={session} path="/portal/campaigns" />;
  const viewing = viewAs ? await db.client.findUnique({ where: { id: clientId }, select: { name: true } }) : null;
  return (
    <>
      {viewing && <ViewAsBanner name={viewing.name} />}
      <PortalCampaigns clientId={viewAs ? clientId : null} />
    </>
  );
}
