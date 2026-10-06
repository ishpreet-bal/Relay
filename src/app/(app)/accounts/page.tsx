import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { AccountsWorkspace } from '@/components/accounts/accounts-workspace';

export const metadata = { title: 'Accounts' };

export default async function AccountsPage() {
  const session = await pageSession('account:read');
  return (
    <AccountsWorkspace
      canWrite={can(session.role, 'account:write')}
      canImport={can(session.role, 'account:import')}
      canEnroll={can(session.role, 'campaign:write')}
      canResearch={can(session.role, 'research:run')}
    />
  );
}
