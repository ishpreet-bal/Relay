import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { CampaignsList } from '@/components/campaigns/campaigns-list';

export const metadata = { title: 'Campaigns' };

export default async function CampaignsPage() {
  const session = await pageSession('campaign:read');
  return <CampaignsList canWrite={can(session.role, 'campaign:write')} />;
}
