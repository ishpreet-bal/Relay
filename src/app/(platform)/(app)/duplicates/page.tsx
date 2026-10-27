import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { DuplicatesWorkspace } from '@/components/accounts/duplicates-workspace';

export const metadata = { title: 'Duplicates' };

export default async function DuplicatesPage() {
  const session = await pageSession('account:read');
  return <DuplicatesWorkspace canMerge={can(session.role, 'account:override')} canDismiss={can(session.role, 'account:write')} />;
}
