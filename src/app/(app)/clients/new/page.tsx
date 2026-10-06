import { pageSession } from '@/lib/page-auth';
import { NewClient } from '@/components/clients/new-client';

export const metadata = { title: 'New client' };

export default async function NewClientPage() {
  await pageSession('client:manage');
  return <NewClient />;
}
