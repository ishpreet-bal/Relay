import { pageSession } from '@/lib/page-auth';
import { EmailHistory } from '@/components/messages/email-history';
export const metadata = { title: 'Email history' };
export default async function EmailHistoryPage() {
  await pageSession('message:read');
  return <EmailHistory />;
}
