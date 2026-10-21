import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { SystemPage } from '@/components/admin/system';

export const metadata = { title: 'System' };

export default async function Page() {
  const session = await pageSession('ops:read');
  // Queue limits and provider budgets are platform-wide: owner only.
  return <SystemPage canRetry={can(session.role, 'settings:write')} canControl={session.role === 'SUPER_ADMIN'} />;
}
