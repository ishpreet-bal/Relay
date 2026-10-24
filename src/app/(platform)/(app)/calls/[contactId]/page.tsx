import { notFound } from 'next/navigation';
import { pageSession } from '@/lib/page-auth';
import { CallWorkspace } from '@/components/calls/call-workspace';

export const metadata = { title: 'Call' };

export default async function CallPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(contactId)) notFound();
  await pageSession('call:log');
  return <CallWorkspace contactId={contactId} />;
}
