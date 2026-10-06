import { notFound } from 'next/navigation';
import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { CampaignDetail } from '@/components/campaigns/campaign-detail';

export const metadata = { title: 'Campaign' };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const session = await pageSession('campaign:read');
  return <CampaignDetail id={id} can={{ write: can(session.role, 'campaign:write'), activate: can(session.role, 'campaign:activate') }} />;
}
