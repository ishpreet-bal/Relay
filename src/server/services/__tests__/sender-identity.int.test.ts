import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * CASL sender identification on a real Postgres: the send gate refuses a
 * client without a mailing address, and a sent email carries who sent it,
 * on whose behalf, the address and a contact, in both the text and HTML
 * parts. Google's endpoints are stubbed at fetch(); nothing leaves the test.
 */

const ORIGINAL = { ...process.env };
Object.assign(process.env, {
  APP_URL: 'https://relay.example', CLERK_SECRET_KEY: 'sk_test_clerk_placeholder', CLERK_WEBHOOK_SECRET: 'whsec_placeholder',
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), UNSUBSCRIBE_SIGNING_KEY: 'unit-test-unsubscribe-signing-key-0123456789', CRON_SECRET: 'unit-test-cron-secret',
  GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'secret-xyz',
});

const { dbTestsAllowed } = await import('@/test/db');
const { db } = await import('@/lib/db');
const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
const { senderIdentification } = await import('../sender-identity');
const { evaluateSend } = await import('../send-gate');
const { sendMessage } = await import('../email');
const { renderHtml } = await import('@/server/ai/personalize');
const { encryptSecret } = await import('@/lib/crypto');

describe('sender identification line', () => {
  it('names the sender, on whose behalf, the address and a contact', () => {
    expect(senderIdentification({ clientName: 'Acme Logistics', mailingAddress: '1 Main St, Toronto, ON', senderBrand: 'Relay', contactEmail: 'sam@acme.test', website: 'https://acme.test/' }))
      .toBe('Sent by Relay on behalf of Acme Logistics · 1 Main St, Toronto, ON · acme.test · sam@acme.test');
    // Writing for itself: one name.
    expect(senderIdentification({ clientName: 'Relay', mailingAddress: '2 King St W, Toronto, ON', senderBrand: 'Relay', contactEmail: 'hello@relay.test', website: null }))
      .toBe('Relay · 2 King St W, Toronto, ON · hello@relay.test');
  });
});

describe.skipIf(!reachable)('CASL footer on sent email (database)', () => {
  const orgId = randomUUID();
  let clientId = '';
  let messageId = '';

  beforeAll(async () => {
    process.env.DIRECT_DATABASE_URL ||= process.env.DATABASE_URL;
    await db.organization.create({ data: { id: orgId, clerkOrgId: `test_${orgId}`, name: 'Relay', brandName: 'Relay', slug: `casl-${orgId.slice(0, 8)}`, minMinutesBetweenSends: 1 } });
    clientId = (await db.client.create({ data: { organizationId: orgId, name: 'Relay', slug: `relay-${orgId.slice(0, 6)}`, kind: 'INTERNAL' } })).id;
    const account = await db.account.create({ data: { organizationId: orgId, clientId, name: 'Synthetic Prospect Ltd', domain: `prospect-${orgId.slice(0, 6)}.test` } });
    const contact = await db.contact.create({ data: { organizationId: orgId, clientId, accountId: account.id, firstName: 'Pat', emailVerification: 'VALID', emailVerifiedAt: new Date(), consentBasis: 'EXPRESS', consentNote: 'Synthetic fixture: express permission recorded for this test', email: `pat@prospect-${orgId.slice(0, 6)}.test` } });
    const mailbox = await db.mailbox.create({
      data: { organizationId: orgId, provider: 'GMAIL', fromName: 'Ish', fromEmail: 'ish@relay.test', spfVerified: true, dkimVerified: true, oauthRefreshTokenEnc: encryptSecret('rt'), oauthEmail: 'ish@relay.test' },
    });
    messageId = (await db.message.create({
      data: {
        organizationId: orgId, clientId, accountId: account.id, contactId: contact.id, mailboxId: mailbox.id, status: 'APPROVED', approvalSource: 'HUMAN',
        subject: 'Quote requests', bodyText: 'Hi Pat,\n\nA question about your quote desk.', bodyHtml: renderHtml('Hi Pat,\n\nA question about your quote desk.'),
      },
    })).id;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (reachable) await db.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await db.$disconnect();
    process.env = ORIGINAL;
  });

  it('refuses to send until the client has a mailing address', async () => {
    const message = await db.message.findUniqueOrThrow({ where: { id: messageId } });
    expect(await evaluateSend(message)).toMatchObject({ allowed: false, code: 'MISSING_SENDER_IDENTITY', reason: expect.stringMatching(/mailing address for Relay/) });
    await db.client.update({ where: { id: clientId }, data: { mailingAddress: '2 King St W, Toronto, ON M5H 1A1' } });
    expect(await evaluateSend(message)).toMatchObject({ allowed: true });
  });

  it('puts the identification in the text and HTML parts', async () => {
    let raw = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('oauth2.googleapis.com/token')) return Response.json({ access_token: 'at' });
      raw = Buffer.from(JSON.parse(String(init?.body)).raw, 'base64url').toString('utf8');
      return Response.json({ id: 'gmail-1' });
    }));
    const out = await sendMessage(messageId);
    expect(out.sent).toBe(true);
    const parts = raw.split(/--[^\r\n]+\r\n/).filter((p) => /Content-Transfer-Encoding: base64/.test(p))
      .map((p) => Buffer.from(p.split('\r\n\r\n')[1]!.replace(/\s/g, ''), 'base64').toString('utf8'));
    expect(parts).toHaveLength(2);
    for (const part of parts) {
      expect(part).toContain('Relay · 2 King St W, Toronto, ON M5H 1A1 · ish@relay.test');
      expect(part).not.toContain('{{');
    }
  });
});
