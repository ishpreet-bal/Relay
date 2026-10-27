import { pageSession } from '@/lib/page-auth';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { CampaignBuilder } from '@/components/campaigns/campaign-builder';

export const metadata = { title: 'New campaign' };

export default async function NewCampaignPage() {
  await pageSession('campaign:write');
  return (
    <>
      <Topbar title="New campaign" showClientSwitcher={false} />
      <PageBody width="narrow">
        <CampaignBuilder />
      </PageBody>
    </>
  );
}
