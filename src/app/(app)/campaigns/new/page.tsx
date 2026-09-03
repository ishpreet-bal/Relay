import { requirePermission } from '@/lib/auth';
import { Topbar } from '@/components/shell/topbar';
import { CampaignBuilder } from '@/components/campaigns/campaign-builder';

export const metadata = { title: 'New campaign' };

export default async function NewCampaignPage() {
  await requirePermission('campaign:write');
  return (
    <>
      <Topbar title="New campaign" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6">
          <CampaignBuilder />
        </div>
      </div>
    </>
  );
}
