import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { StudioWorkspace } from '@/components/studio/studio-workspace';

export const metadata = { title: 'Studio' };

export default async function StudioPage() {
  const session = await pageSession('studio:read');
  return (
    <StudioWorkspace
      canWrite={can(session.role, 'studio:write')}
      canDeploy={can(session.role, 'studio:deploy')}
      canSecrets={can(session.role, 'studio:secrets')}
      canRun={can(session.role, 'studio:run')}
    />
  );
}
