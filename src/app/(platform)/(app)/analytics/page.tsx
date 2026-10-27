import { pageSession } from '@/lib/page-auth';
import { AnalyticsPage } from '@/components/analytics/analytics-page';

export const metadata = { title: 'Analytics' };

export default async function Page() {
  await pageSession('analytics:read');
  return <AnalyticsPage />;
}
