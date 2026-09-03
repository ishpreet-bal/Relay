import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { Topbar } from '@/components/shell/topbar';
import { SuppressionList } from '@/components/review/suppression-list';

export const metadata = { title: 'Do not contact' };

export default async function SuppressionPage() {
  const session = await requirePermission('suppression:read');
  return (
    <>
      <Topbar title="Do not contact" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6">
          <p className="text-sm text-muted mb-5 max-w-xl">
            Every address here is checked before any email leaves the platform. Opt-outs,
            hard bounces, and spam complaints are added automatically and cannot be removed.
          </p>
          <SuppressionList canWrite={can(session.role, 'suppression:write')} />
        </div>
      </div>
    </>
  );
}
