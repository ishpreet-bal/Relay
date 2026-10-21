import { notFound } from 'next/navigation';
import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { ApplicationDetail } from '@/components/studio/application-detail';

export const metadata = { title: 'Application · Studio' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await pageSession('studio:read');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return (
    <ApplicationDetail
      id={id}
      caps={{
        canWrite: can(session.role, 'studio:write'),
        canDeploy: can(session.role, 'studio:deploy'),
        canSecrets: can(session.role, 'studio:secrets'),
        canRun: can(session.role, 'studio:run'),
      }}
    />
  );
}
