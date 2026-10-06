import { notFound } from 'next/navigation';
import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { AccountDetail } from '@/components/accounts/account-detail';

export const metadata = { title: 'Account' };

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const session = await pageSession('account:read');
  const r = session.role;
  return (
    <AccountDetail
      id={id}
      can={{
        write: can(r, 'account:write'),
        override: can(r, 'account:override'),
        remove: can(r, 'account:delete'),
        research: can(r, 'research:run'),
        draft: can(r, 'message:draft'),
        call: can(r, 'call:log'),
        enroll: can(r, 'campaign:write'),
      }}
    />
  );
}
