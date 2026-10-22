import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { DiscoveryWorkspace } from '@/components/discovery/discovery-workspace';

export const metadata = { title: 'Discovery' };

export default async function DiscoveryPage() {
  const session = await pageSession('account:read');
  return <DiscoveryWorkspace canRun={can(session.role, 'account:import')} />;
}
