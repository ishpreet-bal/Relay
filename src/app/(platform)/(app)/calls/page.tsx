import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { CallQueue } from '@/components/calls/call-queue';

export const metadata = { title: 'Call queue' };

export default async function CallsPage() {
  const session = await pageSession('call:read');
  return <CallQueue canAssign={can(session.role, 'call:assign')} />;
}
