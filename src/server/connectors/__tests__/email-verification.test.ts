import { afterEach, describe, expect, it, vi } from 'vitest';
import { hunterStatus, hunterVerifier, zeroBounceStatus, zeroBounceVerifier } from '../providers/email-verification';

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('email verification adapters', () => {
  afterEach(() => { delete process.env.ZEROBOUNCE_API_KEY; delete process.env.HUNTER_API_KEY; });

  it('maps provider statuses without guessing', () => {
    expect(['valid', 'catch-all', 'invalid', 'spamtrap', 'abuse', 'do_not_mail', 'unknown', undefined].map(zeroBounceStatus))
      .toEqual(['VALID', 'CATCH_ALL', 'INVALID', 'INVALID', 'INVALID', 'INVALID', 'UNVERIFIED', 'UNVERIFIED']);
    expect(['valid', 'accept_all', 'webmail', 'disposable', 'invalid', 'unknown'].map(hunterStatus))
      .toEqual(['VALID', 'CATCH_ALL', 'RISKY', 'INVALID', 'INVALID', 'UNVERIFIED']);
  });

  it('reports not configured, provider errors and results as such', async () => {
    const ctx = { organizationId: 'o' };
    expect((await zeroBounceVerifier(reply(200, {})).verifyEmail({ email: 'a@b.test' }, ctx)).error).toMatch(/not configured/);
    process.env.ZEROBOUNCE_API_KEY = 'zb_test';
    const ok = reply(200, { status: 'valid' });
    const res = await zeroBounceVerifier(ok).verifyEmail({ email: 'ops@example.test' }, ctx);
    expect(res).toMatchObject({ status: 'SUCCESS', data: { verification: 'VALID' } });
    expect(String((ok.mock.calls[0] as unknown[])[0])).toContain('email=ops%40example.test');
    expect(await zeroBounceVerifier(reply(200, { error: 'Invalid API key' })).verifyEmail({ email: 'a@b.test' }, ctx)).toMatchObject({ status: 'ERROR', error: 'Invalid API key' });

    process.env.HUNTER_API_KEY = 'h_test';
    expect(await hunterVerifier(reply(200, { data: { status: 'accept_all', score: 70 } })).verifyEmail({ email: 'a@b.test' }, ctx)).toMatchObject({ status: 'SUCCESS', data: { verification: 'CATCH_ALL' }, confidence: 0.7 });
    expect((await hunterVerifier(reply(202, {})).verifyEmail({ email: 'a@b.test' }, ctx)).status).toBe('ERROR');
  });
});
