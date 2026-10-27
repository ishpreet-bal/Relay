import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { WebsiteInquiries } from '@/components/inquiries/website-inquiries';

export const metadata = { title: 'Website inquiries' };

export default async function InquiriesPage() {
  const session = await pageSession('account:read');
  return <WebsiteInquiries canEdit={can(session.role, 'account:write')} canBook={can(session.role, 'meeting:write')} />;
}
