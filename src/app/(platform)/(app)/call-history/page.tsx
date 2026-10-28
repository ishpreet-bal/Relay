import { pageSession } from '@/lib/page-auth';
import { CallHistory } from '@/components/calls/call-history';
export const metadata = { title: 'Call history' };
export default async function CallHistoryPage() {
  await pageSession('call:read');
  return <CallHistory />;
}
