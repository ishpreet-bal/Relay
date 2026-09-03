import { Webhook, WebhookVerificationError } from 'svix';

/**
 * Webhook signature verification.
 *
 * Resend delivers webhooks through Svix, the same infrastructure Clerk uses, so
 * both providers share one verifier rather than each getting a hand-rolled HMAC
 * check. This matters: the earlier version of this file accepted several
 * plausible signature formats because the exact scheme wasn't confirmed, and a
 * permissive check on a public endpoint is a vulnerability, not flexibility.
 * The official library implements the scheme exactly and rejects everything else.
 *
 * What Svix actually signs: `${svix-id}.${svix-timestamp}.${raw body}`, HMAC
 * SHA-256, keyed on the secret with its `whsec_` prefix stripped and the
 * remainder base64-decoded. The library also enforces a timestamp tolerance,
 * which is what stops an attacker replaying a captured "this bounced" event
 * back at you a week later.
 *
 * If a provider ever moves off Svix, this is the only file that changes.
 */

export class SignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignatureError';
  }
}

export interface VerifiedWebhook<T> {
  id: string;
  payload: T;
}

/**
 * Verifies and parses a webhook request. Throws SignatureError on any failure —
 * bad signature, missing headers, stale timestamp. Callers must not fall back
 * to processing unverified payloads.
 */
export function verifyWebhook<T>(params: {
  body: string;
  headers: Headers;
  secret: string;
}): VerifiedWebhook<T> {
  const id = params.headers.get('svix-id');
  const timestamp = params.headers.get('svix-timestamp');
  const signature = params.headers.get('svix-signature');

  if (!id || !timestamp || !signature) {
    throw new SignatureError('Missing svix-id, svix-timestamp, or svix-signature header');
  }
  if (!params.secret) {
    throw new SignatureError('Webhook secret is not configured');
  }

  try {
    const payload = new Webhook(params.secret).verify(params.body, {
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': signature,
    }) as T;
    return { id, payload };
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      throw new SignatureError(`Signature verification failed: ${err.message}`);
    }
    throw new SignatureError('Signature verification failed');
  }
}
