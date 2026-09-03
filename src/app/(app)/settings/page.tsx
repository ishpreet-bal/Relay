import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { Topbar } from '@/components/shell/topbar';
import { SettingsPanels } from '@/components/dashboard/settings-panels';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const session = await requirePermission('settings:read');
  return (
    <>
      <Topbar title="Settings" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6">
          <SettingsPanels
            canWrite={can(session.role, 'settings:write')}
            canBill={can(session.role, 'billing:manage')}
            canAudit={can(session.role, 'audit:read')}
          />
        </div>
      </div>
    </>
  );
}
