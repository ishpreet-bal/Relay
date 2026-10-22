import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { can } from '@/lib/rbac';
import { authorizationUrl, googleConfigured } from '@/server/services/gmail';

/** Starts connecting a mailbox to Gmail: redirects to Google's consent screen. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !can(session.role, 'settings:write')) return new Response('Forbidden', { status: 403 });
  if (!googleConfigured()) return new Response('Google is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).', { status: 503 });
  const mailboxId = new URL(req.url).searchParams.get('mailboxId') ?? '';
  const mailbox = /^[0-9a-f-]{36}$/i.test(mailboxId) ? await db.mailbox.findFirst({ where: { id: mailboxId, organizationId: session.organizationId } }) : null;
  if (!mailbox) return new Response('Mailbox not found', { status: 404 });
  return NextResponse.redirect(authorizationUrl({ organizationId: session.organizationId, mailboxId: mailbox.id, userId: session.userId }, mailbox.fromEmail));
}
