import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { Topbar } from '@/components/shell/topbar';
import { PageBody } from '@/components/ui/page';
import { SuppressionList } from '@/components/compliance/suppression-list';

export const metadata = { title: 'Do not contact' };

export default async function SuppressionPage() {
  const session = await pageSession('suppression:read');
  return (
    <>
      <Topbar title="Do not contact" />
      <PageBody width="narrow">
        <p className="text-sm text-muted mb-5 max-w-xl">
          Checked before every email and before anyone is put in the call queue. Unsubscribes, bounces, complaints and
          do-not-contact requests are added automatically and cannot be removed.
        </p>
        <SuppressionList canWrite={can(session.role, 'suppression:write')} />
      </PageBody>
    </>
  );
}
