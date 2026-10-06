import { describe, it, expect } from 'vitest';
import { encodeUnsubscribeToken, decodeUnsubscribeToken } from '../unsubscribe-token';

const KEY = 'k'.repeat(64);
const ORG = '3f2b8c1e-9a4d-4c6e-8f1a-2b3c4d5e6f70';

describe('unsubscribe tokens', () => {
  it('round-trips an address that contains dots', () => {
    const token = encodeUnsubscribeToken({ organizationId: ORG, email: 'Jane.Doe@acme.co.uk', nonce: 'abc_-1' }, KEY);
    expect(decodeUnsubscribeToken(token, KEY)).toEqual({ organizationId: ORG, email: 'jane.doe@acme.co.uk' });
  });

  it('round-trips a plain address', () => {
    const token = encodeUnsubscribeToken({ organizationId: ORG, email: 'ops@acme.com', nonce: 'n0nce' }, KEY);
    expect(decodeUnsubscribeToken(token, KEY)?.email).toBe('ops@acme.com');
  });

  it('rejects a token signed with another key', () => {
    const token = encodeUnsubscribeToken({ organizationId: ORG, email: 'ops@acme.com', nonce: 'n' }, KEY);
    expect(decodeUnsubscribeToken(token, 'x'.repeat(64))).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = encodeUnsubscribeToken({ organizationId: ORG, email: 'ops@acme.com', nonce: 'n' }, KEY);
    const [, signature] = token.split('.');
    const forged = Buffer.from(`${ORG}.victim@acme.com.n`).toString('base64url');
    expect(decodeUnsubscribeToken(`${forged}.${signature}`, KEY)).toBeNull();
  });

  it('rejects malformed tokens without throwing', () => {
    expect(decodeUnsubscribeToken('', KEY)).toBeNull();
    expect(decodeUnsubscribeToken('abc', KEY)).toBeNull();
    expect(decodeUnsubscribeToken('a.b.c', KEY)).toBeNull();
  });
});
