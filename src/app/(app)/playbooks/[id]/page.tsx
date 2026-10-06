import { notFound } from 'next/navigation';
import { pageSession } from '@/lib/page-auth';
import { can } from '@/lib/rbac';
import { PlaybookEditor } from '@/components/playbooks/playbook-editor';

export const metadata = { title: 'Playbook' };

export default async function PlaybookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const session = await pageSession('playbook:read');
  return <PlaybookEditor id={id} canWrite={can(session.role, 'playbook:write')} />;
}
