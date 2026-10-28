import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { dbTestsAllowed } from '@/test/db';
import { systemAccess } from '@/server/access/scope';
import { discoverContacts, revealEmail, verifyContactEmail } from '../enrichment';
import { resolveAccountContacts, saveWebsiteContacts } from '../contact-resolution';
import { getAccountBrief } from '../account-brief';
import { evaluateSend } from '../send-gate';

const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);

describe.skipIf(!reachable)('usable prospect contacts (Postgres)', () => {
  const orgId = randomUUID();
  let clientId: string;
  let accountId: string;
  const access = systemAccess(orgId);
  beforeAll(async () => {
    await db.organization.create({ data: { id: orgId, clerkOrgId: `contacts-${orgId}`, name: 'Synthetic Relay', slug: `contacts-${orgId}` } });
    const client = await db.client.create({ data: { organizationId: orgId, name: 'Synthetic internal', kind: 'INTERNAL', slug: `internal-${orgId}`, mailingAddress: '1 Test St, Toronto, ON' } });
    clientId = client.id;
    const account = await db.account.create({ data: { organizationId: orgId, clientId, name: 'Synthetic Machine Shop', domain: 'machine.test', websiteUrl: 'https://machine.test' } });
    accountId = account.id;
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  afterAll(async () => { await db.organization.delete({ where: { id: orgId } }); await db.$disconnect(); });

  it('retains distinct Apollo IDs with the same first name, deduplicates repeats and reveals without a surname', async () => {
    vi.stubEnv('APOLLO_API_KEY', 'synthetic-apollo-key');
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes('api_search')) return Response.json({ people: [{ id: 'p-1', first_name: 'Sam', last_name_obfuscated: 'L**', title: 'Owner' }, { id: 'p-2', first_name: 'Sam', last_name_obfuscated: 'W**', title: 'Manager' }] });
      const body = JSON.parse(String(init?.body));
      expect(body.id).toBe('p-1');
      return Response.json({ person: { id: 'p-1', first_name: 'Sam', last_name: 'Lee', email: 'sam@machine.test', email_status: 'verified' } });
    });
    vi.stubGlobal('fetch', fetcher);
    expect((await discoverContacts(access, accountId, 3)).added).toBe(2);
    expect((await discoverContacts(access, accountId, 3)).added).toBe(0);
    const sam = await db.contact.findFirstOrThrow({ where: { accountId, sourceRef: 'p-1' } });
    expect(sam.lastName).toBeNull();
    expect((await revealEmail(access, sam.id)).email).toBe('sam@machine.test');
    expect((await db.contact.findUniqueOrThrow({ where: { id: sam.id } })).lastName).toBe('Lee');
    expect(fetcher.mock.calls).toHaveLength(2); // search cached, one paid reveal
  });

  it('persists literal website contacts idempotently and keeps consent unknown', async () => {
    const found = [{ kind: 'EMAIL' as const, value: 'office@machine.test', sourceUrl: 'https://machine.test/contact', label: 'Office' }, { kind: 'PHONE' as const, value: '+19055550101', sourceUrl: 'https://machine.test/contact', label: 'Office' }];
    await Promise.all([saveWebsiteContacts(access, accountId, found), saveWebsiteContacts(access, accountId, found)]);
    expect(await db.contact.count({ where: { accountId, email: 'office@machine.test' } })).toBe(1);
    expect(await db.contact.count({ where: { accountId, phone: '+19055550101' } })).toBe(1);
    const office = await db.contact.findFirstOrThrow({ where: { accountId, email: 'office@machine.test' } });
    expect(office.consentBasis).toBe('UNKNOWN');
    expect(office.emailVerification).toBe('UNVERIFIED');
    expect(office.sourceUrl).toBe('https://machine.test/contact');
    const other = systemAccess(randomUUID());
    await expect(saveWebsiteContacts(other, accountId, found)).rejects.toThrow('Account');
  });

  it('exposes missing research and contact-provider limitations without claiming readiness', async () => {
    const fresh = await db.account.create({ data: { organizationId: orgId, clientId, name: 'No details', domain: 'nodetails.test' } });
    const result = await resolveAccountContacts(access, fresh.id);
    expect(result.state).toBe('CONTACT_MISSING');
    expect(result.issues.some((s) => s.includes('Apollo or Hunter'))).toBe(true);
    const brief = await getAccountBrief(access, fresh.id);
    expect(brief.state).toBe('RESEARCH_REQUIRED');
    expect(brief.workflows).toEqual([]);
  });

  it('keeps the original verification time when a cached result is reused', async () => {
    vi.stubEnv('ZEROBOUNCE_API_KEY', 'synthetic-verifier-key');
    const office = await db.contact.findFirstOrThrow({ where: { accountId, email: 'office@machine.test' } });
    const checkedAt = new Date(Date.now() - 20 * 86400_000);
    await db.providerRecord.create({ data: { organizationId: orgId, clientId, accountId, contactId: office.id,
      provider: 'zerobounce', operation: 'email.verify', lookupKey: office.email!, status: 'SUCCESS', normalized: { verification: 'VALID' },
      requestedAt: checkedAt, expiresAt: new Date(Date.now() + 10 * 86400_000) } });
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect((await verifyContactEmail(access, office.id)).verification).toBe('VALID');
    const after = await db.contact.findUniqueOrThrow({ where: { id: office.id } });
    expect(after.emailVerifiedAt?.getTime()).toBe(checkedAt.getTime());
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires human approval, fresh verification and an explicit outreach basis at the final send gate', async () => {
    const contact = await db.contact.findFirstOrThrow({ where: { accountId, sourceRef: 'p-1' } });
    const mailbox = await db.mailbox.create({ data: { organizationId: orgId, provider: 'RESEND', fromName: 'Synthetic', fromEmail: 'hello@relay.test', spfVerified: true, dkimVerified: true } });
    const message = await db.message.create({ data: { organizationId: orgId, clientId, accountId, contactId: contact.id, mailboxId: mailbox.id, status: 'APPROVED', approvalSource: 'POLICY', subject: 'A question', bodyHtml: '<p>Hi</p><a href="{{unsubscribe_url}}">Unsubscribe</a>' } });
    expect(await evaluateSend(message)).toMatchObject({ allowed: false, code: 'NOT_APPROVED' });
    const human = { ...message, approvalSource: 'HUMAN' as const };
    expect(await evaluateSend(human)).toMatchObject({ allowed: false, code: 'CONSENT_REQUIRED' });
    await db.contact.update({ where: { id: contact.id }, data: { consentBasis: 'EXPRESS', consentNote: 'Synthetic fixture: permission to send this test' } });
    expect(await evaluateSend(human)).toMatchObject({ allowed: true });
    await db.contact.update({ where: { id: contact.id }, data: { emailVerifiedAt: new Date('2020-01-01') } });
    expect(await evaluateSend(human)).toMatchObject({ allowed: false, code: 'EMAIL_UNVERIFIED' });
  });
});
