import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { PlaybooksList } from '@/components/playbooks/playbooks-list';

export const metadata = { title: 'Playbooks' };

export default async function PlaybooksPage() {
  const session = await pageSession('playbook:read');
  return <PlaybooksList canWrite={can(session.role, 'playbook:write')} />;
}
