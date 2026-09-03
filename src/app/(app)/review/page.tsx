import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { Topbar } from '@/components/shell/topbar';
import { ReviewQueue } from '@/components/review/review-queue';
import { TierPerformancePanel } from '@/components/review/tier-performance-panel';

export const metadata = { title: 'Review queue' };

export default async function ReviewPage() {
  const session = await requirePermission('message:read');

  return (
    <>
      <Topbar title="Review queue" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6 space-y-5">
          <TierPerformancePanel />
          <ReviewQueue
            canApprove={can(session.role, 'message:approve')}
            canSend={can(session.role, 'message:send')}
          />
        </div>
      </div>
    </>
  );
}
