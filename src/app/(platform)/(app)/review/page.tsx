import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { ReviewQueue } from '@/components/review/review-queue';
import { TierPerformancePanel } from '@/components/review/tier-performance-panel';

export const metadata = { title: 'Review queue' };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ campaign?: string }> }) {
  const session = await pageSession('message:read');
  const { campaign } = await searchParams;
  const campaignId = campaign && /^[0-9a-f-]{36}$/i.test(campaign) ? campaign : undefined;
  return (
    <>
      <Topbar title="Review queue" />
      <PageBody width="narrow" className="space-y-5">
        <TierPerformancePanel />
        <ReviewQueue campaignId={campaignId} canApprove={can(session.role, 'message:approve')} canSend={can(session.role, 'message:send')} />
      </PageBody>
    </>
  );
}
