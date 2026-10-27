import { notFound } from 'next/navigation';
import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { OpportunityDetail } from '@/components/delivery/opportunity-detail';

export const metadata = { title: 'Opportunity' };

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const session = await pageSession('account:read');
  const r = session.role;
  return (
    <OpportunityDetail
      id={id}
      caps={{
        write: can(r, 'account:write'), review: can(r, 'account:override'), demo: can(r, 'studio:write'),
        propose: can(r, 'proposal:write'), send: can(r, 'proposal:send'), convert: can(r, 'client:manage'),
      }}
    />
  );
}
