import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

/**
 * Opt-out links are HMAC-signed and self-describing, so a recipient can
 * unsubscribe long after the token row is pruned. The database row exists for
 * auditing; the signature is what authorizes the action. Opting out never
 * requires a login, a reason, or a second click.
 */
function sign(payload: string) {
  return createHmac('sha256', env().UNSUBSCRIBE_SIGNING_KEY).update(payload).digest('base64url');
}

export async function issueUnsubscribeToken(organizationId: string, email: string) {
  const normalized = email.toLowerCase().trim();
  const nonce = randomBytes(6).toString('base64url');
  const payload = `${organizationId}.${normalized}.${nonce}`;
  const token = `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
  await db.unsubscribeToken.create({ data: { organizationId, email: normalized, token } });
  return token;
}

export function unsubscribeUrl(token: string) {
  return `${env().APP_URL}/u/${token}`;
}

export function verifyUnsubscribeToken(token: string): { organizationId: string; email: string } | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  let payload: string;
  try { payload = Buffer.from(encoded, 'base64url').toString('utf8'); } catch { return null; }

  const expected = sign(payload);
  if (expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;

  const [organizationId, email] = payload.split('.');
  if (!organizationId || !email) return null;
  return { organizationId, email };
}
