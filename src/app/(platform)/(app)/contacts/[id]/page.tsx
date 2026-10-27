import { notFound } from 'next/navigation';
import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { ContactDetail } from '@/components/accounts/contact-detail';

export const metadata = { title: 'Contact' };

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const session = await pageSession('account:read');
  const r = session.role;
  return (
    <ContactDetail
      id={id}
      can={{ write: can(r, 'account:write'), call: can(r, 'call:log'), draft: can(r, 'message:draft'), suppress: can(r, 'suppression:write') }}
    />
  );
}
