import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { PipelineWorkspace } from '@/components/pipeline/pipeline-workspace';

export const metadata = { title: 'Research funnel' };

export default async function PipelinePage() {
  const session = await pageSession('account:read');
  return (
    <PipelineWorkspace
      canRun={can(session.role, 'research:run')}
      canConfigure={can(session.role, 'settings:write')}
      canOverride={can(session.role, 'account:override')}
    />
  );
}
