import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { ContactsWorkspace } from '@/components/accounts/contacts-workspace';

export const metadata = { title: 'Contacts' };

export default async function ContactsPage() {
  const session = await pageSession('account:read');
  return <ContactsWorkspace canEnroll={can(session.role, 'campaign:write')} canExport={can(session.role, 'account:import')} />;
}
