import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { Sidebar } from '@/components/shell/sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const pendingReview = await db.message.count({
    where: { organizationId: session.organizationId, status: 'DRAFT', direction: 'OUTBOUND' },
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={session.role} pendingReview={pendingReview} />
      <div className="flex-1 flex flex-col min-w-0">{children}</div>
    </div>
  );
}
