import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { NoWebsiteLeads } from '@/components/calls/no-website-leads';

export const metadata = { title: 'No-website leads' };

export default async function NoWebsitePage() {
  const session = await pageSession('call:read');
  return <NoWebsiteLeads canLog={can(session.role, 'call:log')} canConvert={can(session.role, 'account:write')} />;
}
