import { pageSession } from '@/lib/page-auth';
import { TeamPage } from '@/components/admin/team';

export const metadata = { title: 'Team' };

export default async function Page() {
  const session = await pageSession('member:manage');
  return <TeamPage currentUserId={session.userId} />;
}
