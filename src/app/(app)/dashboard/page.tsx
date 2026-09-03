import { requirePermission } from '@/lib/auth';
import { Topbar } from '@/components/shell/topbar';
import { DashboardOverview } from '@/components/dashboard/overview';

export const metadata = { title: 'Overview' };

export default async function DashboardPage() {
  await requirePermission('lead:read');
  return (
    <>
      <Topbar title="Overview" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6">
          <DashboardOverview />
        </div>
      </div>
    </>
  );
}
