import { pageSession } from '@/lib/page-auth';
import { DashboardOverview } from '@/components/dashboard/overview';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  await pageSession('analytics:read');
  return <DashboardOverview />;
}
