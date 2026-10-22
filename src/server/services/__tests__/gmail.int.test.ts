import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Gmail mailboxes with Google's endpoints faked: signed state, identity
 * checks, the token stored encrypted and never returned, sending through
 * the Gmail API with the unsubscribe headers, DNS-based domain checks, and
 * disconnecting. No live Google call is made.
 */

const ORIGINAL = { ...process.env };
Object.assign(process.env, {
  APP_URL: 'https://relay.example', CLERK_SECRET_KEY: 'sk_test_clerk_placeholder', CLERK_WEBHOOK_SECRET: 'whsec_placeholder',
  ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'), UNSUBSCRIBE_SIGNING_KEY: 'unit-test-unsubscribe-signing-key-0123456789', CRON_SECRET: 'unit-test-cron-secret',
  GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'secret-xyz',
});

const { dbTestsAllowed } = await import('@/test/db');
const { db } = await import('@/lib/db');
const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
const gmail = await import('../gmail');
const { listMailboxes } = await import('../mailboxes');

const idToken = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('gmail building blocks', () => {
  it('signs state that expires and resists tampering', () => {
    const s = { organizationId: 'o', mailboxId: 'm', userId: 'u' };
    const token = gmail.signState(s, 1_000);
    expect(gmail.verifyState(token, 2_000)).toEqual(s);
    expect(gmail.verifyState(token, 1_000 + 11 * 60_000)).toBeNull();
    const [body] = token.split('.');
    expect(gmail.verifyState(`${body}.forged`, 2_000)).toBeNull();
    const other = Buffer.from(JSON.stringify({ ...s, userId: 'attacker', e: 9e15 })).toString('base64url');
    expect(gmail.verifyState(`${other}.${token.split('.')[1]}`, 2_000)).toBeNull();
  });

  it('accepts an identity only for this app, from Google, with a confirmed email', () => {
    const ok = { aud: 'client-123.apps.googleusercontent.com', iss: 'https://accounts.google.com', email: 'Sales@Example.com', email_verified: true };
    expect(gmail.idTokenEmail(idToken(ok), ok.aud)).toBe('sales@example.com');
    expect(() => gmail.idTokenEmail(idToken({ ...ok, aud: 'other' }), ok.aud)).toThrow(/not issued for this app/);
    expect(() => gmail.idTokenEmail(idToken({ ...ok, email_verified: false }), ok.aud)).toThrow(/did not confirm/);
  });

  it('builds a multipart message with encoded headers and no header injection', () => {
    const mime = gmail.buildMime({
      from: 'Ish <sales@example.com>', to: 'buyer@acme.test', replyTo: 'sales@example.com', subject: 'Café automation\r\nBcc: evil@x.test',
      text: 'Hello', html: '<p>Hello</p>', headers: { 'List-Unsubscribe': '<https://relay.example/u/x>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }, 'b1');
    expect(mime).toContain('Subject: =?UTF-8?B?');
    expect(mime).not.toMatch(/^Bcc:/m);
    expect(mime).toContain('List-Unsubscribe: <https://relay.example/u/x>');
    expect(mime).toContain('Content-Type: multipart/alternative; boundary="b1"');
    expect(mime).toContain(Buffer.from('<p>Hello</p>').toString('base64'));
    expect(mime.split('\r\n').includes('--b1--')).toBe(true);
  });

  it('checks Google SPF and DKIM from DNS', async () => {
    const dns = (records: Record<string, string[][]>) => async (host: string) => records[host] ?? Promise.reject(new Error('ENOTFOUND'));
    expect(await gmail.gmailDomainStatus('example.com', dns({ 'example.com': [['v=spf1 include:_spf.google.com ~all']], 'google._domainkey.example.com': [['v=DKIM1; k=rsa; p=MIIBIjAN', 'BgkqhkiG']] }))).toMatchObject({ spf: true, dkim: true });
    expect(await gmail.gmailDomainStatus('example.com', dns({ 'example.com': [['v=spf1 include:mailgun.org ~all']] }))).toMatchObject({ spf: false, dkim: false });
  });
});

describe.skipIf(!reachable)('gmail mailboxes (database)', () => {
  const orgId = randomUUID();
  const userId = randomUUID();
  let mailboxId = '';

  beforeAll(async () => {
    process.env.DIRECT_DATABASE_URL ||= process.env.DATABASE_URL;
    await db.organization.create({ data: { id: orgId, clerkOrgId: `test_${orgId}`, name: 'Gmail test', slug: `gmail-${orgId.slice(0, 8)}` } });
    mailboxId = (await db.mailbox.create({ data: { organizationId: orgId, fromName: 'Ish', fromEmail: 'sales@example.com' } })).id;
  });

  afterAll(async () => {
    if (reachable) await db.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await db.$disconnect();
    process.env = ORIGINAL;
  });

  const tokenReply = (email: string, extra: object = {}) => vi.fn(async () => json(200, {
    access_token: 'at', refresh_token: 'rt-secret', scope: 'https://www.googleapis.com/auth/gmail.send openid https://www.googleapis.com/auth/userinfo.email',
    id_token: idToken({ aud: 'client-123.apps.googleusercontent.com', iss: 'https://accounts.google.com', email, email_verified: true }), ...extra,
  }));

  it('refuses a state started by someone else, and a different Google account', async () => {
    const state = gmail.signState({ organizationId: orgId, mailboxId, userId });
    await expect(gmail.completeConnection({ code: 'c', state, sessionUserId: randomUUID(), sessionOrganizationId: orgId }, tokenReply('sales@example.com'))).rejects.toThrow(/expired or was started by someone else/);
    await expect(gmail.completeConnection({ code: 'c', state, sessionUserId: userId, sessionOrganizationId: orgId }, tokenReply('personal@gmail.com'))).rejects.toThrow(/signed in as personal@gmail.com/);
    expect((await db.mailbox.findUniqueOrThrow({ where: { id: mailboxId } })).oauthRefreshTokenEnc).toBeNull();
  });

  it('connects the matching account, keeps the token encrypted, and never returns it', async () => {
    const fetchImpl = tokenReply('sales@example.com');
    const state = gmail.signState({ organizationId: orgId, mailboxId, userId });
    const mailbox = await gmail.completeConnection({ code: 'auth-code', state, sessionUserId: userId, sessionOrganizationId: orgId }, fetchImpl);
    const sent = new URLSearchParams(String(((fetchImpl.mock.calls[0] as unknown[])[1] as RequestInit).body));
    expect([sent.get('grant_type'), sent.get('code'), sent.get('redirect_uri')]).toEqual(['authorization_code', 'auth-code', 'https://relay.example/api/oauth/google/callback']);
    expect(mailbox.provider).toBe('GMAIL');
    expect(mailbox.oauthRefreshTokenEnc).not.toContain('rt-secret');
    const listed = await listMailboxes(orgId);
    expect(JSON.stringify(listed)).not.toContain(mailbox.oauthRefreshTokenEnc!);
    expect(listed[0]).toMatchObject({ gmailConnected: true, oauthEmail: 'sales@example.com' });
  });

  it('sends through the Gmail API with a fresh access token, and disconnects', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return String(url).includes('oauth2.googleapis.com/token') ? json(200, { access_token: 'fresh-access' }) : json(200, { id: 'gmail-msg-1' });
    });
    const mailbox = await db.mailbox.findUniqueOrThrow({ where: { id: mailboxId } });
    const res = await gmail.sendViaGmail(mailbox, { from: 'Ish <sales@example.com>', to: 'buyer@acme.test', replyTo: 'sales@example.com', subject: 'Hello', html: '<p>Hi</p>', text: 'Hi', headers: { 'List-Unsubscribe': '<https://relay.example/u/t>' } }, fetchImpl as never);
    expect(res.providerMessageId).toBe('gmail-msg-1');
    expect(new URLSearchParams(String(calls[0]!.init.body)).get('refresh_token')).toBe('rt-secret');
    expect((calls[1]!.init.headers as Record<string, string>).authorization).toBe('Bearer fresh-access');
    const raw = Buffer.from(JSON.parse(String(calls[1]!.init.body)).raw, 'base64url').toString('utf8');
    expect(raw).toContain('To: buyer@acme.test');
    expect(raw).toContain('List-Unsubscribe: <https://relay.example/u/t>');

    // A revoked grant is recorded on the mailbox for the owner to reconnect.
    const revoked = vi.fn(async () => json(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }));
    await expect(gmail.sendViaGmail(mailbox, { from: 'a', to: 'b', replyTo: 'a', subject: 's', html: '', text: '', headers: {} }, revoked as never)).rejects.toThrow(/revoked/);
    expect((await db.mailbox.findUniqueOrThrow({ where: { id: mailboxId } })).oauthError).toMatch(/revoked/);

    const revoke = vi.fn(async () => new Response('', { status: 200 }));
    const off = await gmail.disconnectGmail(orgId, mailboxId, revoke as never);
    expect(String((revoke.mock.calls[0] as unknown[])[0])).toContain('oauth2.googleapis.com/revoke');
    expect([off.provider, off.oauthRefreshTokenEnc, off.isActive]).toEqual(['RESEND', null, false]);
  });
});
