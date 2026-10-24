import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { SalesBoard } from '@/components/accounts/sales-board';

export const metadata = { title: 'Sales pipeline' };

export default async function SalesPage() {
  const session = await pageSession('account:read');
  return <SalesBoard canMove={can(session.role, 'account:write')} />;
}
