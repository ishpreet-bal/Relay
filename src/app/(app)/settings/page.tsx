import { pageSession } from '@/lib/page-auth';
import { PageBody } from '@/components/ui/page';
import { can } from '@/lib/rbac';
import { Topbar } from '@/components/shell/topbar';
import { SettingsPanels } from '@/components/dashboard/settings-panels';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const session = await pageSession('settings:read');
  return (
    <>
      <Topbar title="Settings" showClientSwitcher={false} />
      <PageBody width="narrow">
        <SettingsPanels
          canWrite={can(session.role, 'settings:write')}
          canBill={can(session.role, 'billing:manage')}
          canAudit={can(session.role, 'audit:read')}
        />
      </PageBody>
    </>
  );
}
