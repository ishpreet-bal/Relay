import { pageSession } from '@/lib/page-auth';
import { BillingWorkspace } from '@/components/billing/billing-workspace';

export const metadata = { title: 'Billing' };

export default async function BillingPage() {
  await pageSession('billing:manage');
  return <BillingWorkspace />;
}
