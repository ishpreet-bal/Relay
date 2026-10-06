import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Pure encode/decode for signed opt-out tokens, kept free of env and database
 * access so the parsing rules can be tested directly.
 *
 * Payload layout: `${organizationId}.${email}.${nonce}`. The organization id
 * is a UUID and the nonce is base64url, so neither contains a dot — but the
 * email almost always does. Decoding therefore takes the first and last
 * segments as fixed and treats everything between them as the address.
 * (An earlier version split on every dot and recorded `jane.doe@acme.com` as
 * `jane`, which left the real address unsuppressed.)
 */

export interface UnsubscribePayload {
  organizationId: string;
  email: string;
}

function sign(payload: string, key: string) {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function encodeUnsubscribeToken(
  params: UnsubscribePayload & { nonce: string },
  key: string,
): string {
  const payload = `${params.organizationId}.${params.email.toLowerCase().trim()}.${params.nonce}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload, key)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decodeUnsubscribeToken(token: string, key: string): UnsubscribePayload | null {
  const [encoded, signature, ...extra] = token.split('.');
  if (!encoded || !signature || extra.length) return null;

  let payload: string;
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  const first = payload.indexOf('.');
  const last = payload.lastIndexOf('.');
  if (first === -1 || last <= first) return null;

  const organizationId = payload.slice(0, first);
  const email = payload.slice(first + 1, last);
  if (!UUID.test(organizationId) || !email.includes('@')) return null;

  return { organizationId, email };
}
