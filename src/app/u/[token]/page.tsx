import { verifyUnsubscribeToken } from '@/server/services/unsubscribe';
import { suppress } from '@/server/services/suppression';
import { db } from '@/lib/db';

export const metadata = { title: 'Unsubscribe' };
export const dynamic = 'force-dynamic';

/**
 * The opt-out page. No login, no confirmation step, no "are you sure", no
 * dark patterns. The GET itself performs the unsubscribe — a recipient who
 * clicks should be done, and mailbox providers penalize friction here.
 */
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verified = verifyUnsubscribeToken(token);

  if (!verified) {
    return (
      <Shell title="This link isn't valid">
        <p>
          The link may have been altered in transit. Reply to the email you received
          with the word “unsubscribe” and you&apos;ll be removed manually.
        </p>
      </Shell>
    );
  }

  const org = await db.organization.findUnique({
    where: { id: verified.organizationId },
    select: { brandName: true, name: true },
  });

  await suppress({
    organizationId: verified.organizationId,
    value: verified.email,
    reason: 'UNSUBSCRIBE',
    note: 'Recipient used the unsubscribe link',
  });
  await db.unsubscribeToken.updateMany({ where: { token }, data: { usedAt: new Date() } });

  return (
    <Shell title="You're unsubscribed">
      <p>
        <strong>{verified.email}</strong> won&apos;t receive any further email from{' '}
        {org?.brandName ?? org?.name ?? 'us'}. Anything already scheduled has been cancelled.
      </p>
      <p className="text-sm text-muted mt-4">
        This took effect immediately. You don&apos;t need to do anything else.
      </p>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen grid place-items-center bg-canvas px-4">
      <div className="card max-w-md w-full p-8">
        <h1 className="text-xl font-semibold mb-3">{title}</h1>
        <div className="text-[15px] leading-relaxed">{children}</div>
      </div>
    </main>
  );
}
