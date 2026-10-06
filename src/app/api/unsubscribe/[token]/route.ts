import { NextResponse } from 'next/server';
import { verifyUnsubscribeToken } from '@/server/services/unsubscribe';
import { suppress } from '@/server/services/suppression';
import { db } from '@/lib/db';

/**
 * RFC 8058 one-click unsubscribe. Gmail and Yahoo POST here directly from their
 * own UI without ever loading the page, so this must succeed without a session
 * and return 200 quickly. It is listed as public in middleware.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verified = verifyUnsubscribeToken(token);
  if (!verified) return new Response('Invalid token', { status: 400 });

  await suppress({
    organizationId: verified.organizationId,
    value: verified.email,
    reason: 'UNSUBSCRIBE',
    note: 'One-click unsubscribe (RFC 8058)',
  });
  await db.unsubscribeToken.updateMany({ where: { token }, data: { usedAt: new Date() } });

  return new Response(null, { status: 200 });
}

/**
 * Some clients open the List-Unsubscribe URL in a browser instead of POSTing.
 * Send them to the human-facing page, which performs the same opt-out.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/u/${encodeURIComponent(token)}`, req.url), 303);
}
