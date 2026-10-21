import { pageSession } from '@/lib/page-auth';
import { ConnectorsPage } from '@/components/admin/connectors';

export const metadata = { title: 'Connectors' };

export default async function Page() {
  await pageSession('connector:manage');
  return <ConnectorsPage canManage />;
}
