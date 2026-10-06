import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { decodeUnsubscribeToken, encodeUnsubscribeToken } from './unsubscribe-token';

/**
 * Opt-out links are HMAC-signed and self-describing, so a recipient can
 * unsubscribe long after the token row is pruned. The database row exists for
 * auditing; the signature is what authorizes the action. Opting out never
 * requires a login, a reason, or a second click.
 */
export async function issueUnsubscribeToken(organizationId: string, email: string) {
  const normalized = email.toLowerCase().trim();
  const token = encodeUnsubscribeToken(
    { organizationId, email: normalized, nonce: randomBytes(6).toString('base64url') },
    env().UNSUBSCRIBE_SIGNING_KEY,
  );
  await db.unsubscribeToken.create({ data: { organizationId, email: normalized, token } });
  return token;
}

/** The page a person lands on when they click the link in the footer. */
export function unsubscribeUrl(token: string) {
  return `${env().APP_URL}/u/${token}`;
}

/**
 * The RFC 8058 one-click endpoint. Mailbox providers POST here directly from
 * their own UI, so it must be a public API route rather than a page.
 */
export function oneClickUnsubscribeUrl(token: string) {
  return `${env().APP_URL}/api/unsubscribe/${token}`;
}

export function verifyUnsubscribeToken(token: string) {
  return decodeUnsubscribeToken(token, env().UNSUBSCRIBE_SIGNING_KEY);
}
