import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { ProjectsWorkspace } from '@/components/delivery/projects-workspace';

export const metadata = { title: 'Delivery projects' };

export default async function ProjectsPage() {
  const session = await pageSession('proposal:read');
  return <ProjectsWorkspace canLog={can(session.role, 'studio:write')} />;
}
