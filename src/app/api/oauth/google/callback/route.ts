import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { recordAudit } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { completeConnection } from '@/server/services/gmail';
import { checkMailboxDomain } from '@/server/services/mailboxes';

/** Google sends the user back here; the mailbox is connected only if every check passes. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (outcome: string) => NextResponse.redirect(new URL(`/settings?gmail=${encodeURIComponent(outcome)}`, url.origin));
  const session = await getSession();
  if (!session || !can(session.role, 'settings:write')) return new Response('Forbidden', { status: 403 });
  if (url.searchParams.get('error')) return back(`cancelled: ${url.searchParams.get('error')}`);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return back('error: missing code');
  try {
    const mailbox = await completeConnection({ code, state, sessionUserId: session.userId, sessionOrganizationId: session.organizationId });
    await recordAudit({ session, action: 'mailbox.gmail_connected', entityType: 'Mailbox', entityId: mailbox.id, after: { email: mailbox.oauthEmail, scopes: mailbox.oauthScopes } });
    await checkMailboxDomain(session.organizationId, mailbox.id).catch(() => null);
    return back('connected');
  } catch (err) {
    logger.warn('gmail.connect_failed', { userId: session.userId, error: err instanceof Error ? err.message : String(err) });
    return back(`error: ${err instanceof Error ? err.message : 'connection failed'}`);
  }
}
