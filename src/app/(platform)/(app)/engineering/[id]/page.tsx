import { notFound } from 'next/navigation';
import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { ProjectWorkspace } from '@/components/engineering/project-workspace';

export const metadata = { title: 'Engineering project' };

export default async function EngineeringProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await pageSession('studio:read');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <ProjectWorkspace id={id} canWrite={can(session.role, 'studio:write')} />;
}
