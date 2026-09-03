import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyWebhook, SignatureError } from '../webhook-verify';

const SECRET = 'whsec_' + Buffer.from('a'.repeat(32)).toString('base64');

function sign(id: string, timestamp: string, body: string, secret = SECRET) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `v1,${signature}`;
}

function makeHeaders(overrides: Record<string, string | null>) {
  const h = new Headers();
  for (const [k, v] of Object.entries(overrides)) if (v !== null) h.set(k, v);
  return h;
}

describe('verifyWebhook', () => {
  const body = JSON.stringify({ type: 'email.bounced', data: { email_id: 'abc' } });
  const id = 'msg_123';
  const timestamp = String(Math.floor(Date.now() / 1000));

  it('accepts a correctly signed payload', () => {
    const result = verifyWebhook<{ type: string }>({
      body,
      headers: makeHeaders({
        'svix-id': id,
        'svix-timestamp': timestamp,
        'svix-signature': sign(id, timestamp, body),
      }),
      secret: SECRET,
    });
    expect(result.payload.type).toBe('email.bounced');
    expect(result.id).toBe(id);
  });

  it('rejects a tampered body', () => {
    const tampered = JSON.stringify({ type: 'email.bounced', data: { email_id: 'victim' } });
    expect(() =>
      verifyWebhook({
        body: tampered,
        headers: makeHeaders({
          'svix-id': id,
          'svix-timestamp': timestamp,
          'svix-signature': sign(id, timestamp, body),
        }),
        secret: SECRET,
      }),
    ).toThrow(SignatureError);
  });

  it('rejects a signature made with the wrong secret', () => {
    const otherSecret = 'whsec_' + Buffer.from('b'.repeat(32)).toString('base64');
    expect(() =>
      verifyWebhook({
        body,
        headers: makeHeaders({
          'svix-id': id,
          'svix-timestamp': timestamp,
          'svix-signature': sign(id, timestamp, body, otherSecret),
        }),
        secret: SECRET,
      }),
    ).toThrow(SignatureError);
  });

  it('rejects a replayed old event', () => {
    const stale = String(Math.floor(Date.now() / 1000) - 60 * 60 * 24);
    expect(() =>
      verifyWebhook({
        body,
        headers: makeHeaders({
          'svix-id': id,
          'svix-timestamp': stale,
          'svix-signature': sign(id, stale, body),
        }),
        secret: SECRET,
      }),
    ).toThrow(SignatureError);
  });

  it('rejects missing headers', () => {
    expect(() =>
      verifyWebhook({ body, headers: makeHeaders({ 'svix-id': id }), secret: SECRET }),
    ).toThrow(SignatureError);
  });
});
