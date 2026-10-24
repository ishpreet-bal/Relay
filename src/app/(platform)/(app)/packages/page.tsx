import { pageSession } from '@/lib/page-auth';
import { ServicePackages } from '@/components/billing/service-packages';

export const metadata = { title: 'Service packages' };

export default async function PackagesPage() {
  await pageSession('billing:manage');
  return <ServicePackages />;
}
