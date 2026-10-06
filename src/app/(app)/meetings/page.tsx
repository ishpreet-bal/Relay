import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { MeetingsList } from '@/components/meetings/meetings-list';

export const metadata = { title: 'Meetings' };

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const session = await pageSession('meeting:read');
  const { range } = await searchParams;
  const initialRange = range === 'past' || range === 'all' ? range : 'upcoming';
  return <MeetingsList canWrite={can(session.role, 'meeting:write')} initialRange={initialRange} />;
}
