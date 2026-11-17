import { pageSession } from '@/lib/page-auth';
import { ApprovalsInbox } from '@/components/engineering/approvals-inbox';

export const metadata = { title: 'Approvals' };

export default async function ApprovalsPage() {
  await pageSession('account:read');
  return <ApprovalsInbox />;
}
