import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { ClientsList } from '@/components/clients/clients-list';

export const metadata = { title: 'Clients' };

export default async function ClientsPage() {
  const session = await pageSession('clientProfile:write');
  return <ClientsList canManage={can(session.role, 'client:manage')} />;
}
