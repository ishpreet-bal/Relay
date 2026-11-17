import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { CommandCenter } from '@/components/engineering/command-center';

export const metadata = { title: 'Engineering' };

export default async function EngineeringPage() {
  const session = await pageSession('studio:read');
  return <CommandCenter canWrite={can(session.role, 'studio:write')} />;
}
