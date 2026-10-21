import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { OpportunityBoard } from '@/components/delivery/opportunity-ui';

export const metadata = { title: 'Opportunities' };

export default async function OpportunitiesPage() {
  const session = await pageSession('account:read');
  return <OpportunityBoard caps={{ write: can(session.role, 'account:write'), review: can(session.role, 'account:override') }} />;
}
