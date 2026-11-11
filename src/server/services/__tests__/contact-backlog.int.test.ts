import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { dbTestsAllowed } from '@/test/db';
import { systemAccess } from '@/server/access/scope';
import { ensureWebsiteContacts, queueContactBacklog, saveWebsiteContacts } from '../contact-resolution';

// The crawler refuses hosts that don't resolve publicly; these fixtures use .test names.
vi.mock('../net-guard', async (orig) => ({ ...(await orig<typeof import('../net-guard')>()), safeFetch: (url: string, init?: RequestInit) => fetch(url, init) }));

const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);

describe.skipIf(!reachable)('contact lookup without AI research (Postgres)', () => {
  const orgId = randomUUID();
  const access = systemAccess(orgId);
  let clientId: string;
  const account = (name: string, data: Record<string, unknown> = {}) => db.account.create({
    data: { organizationId: orgId, clientId, name, domain: `${name}.test`, websiteUrl: `https://${name}.test`, pipelineStage: 'QUALIFIED', screeningScore: 60, ...data },
  });
  beforeAll(async () => {
    await db.organization.create({ data: { id: orgId, clerkOrgId: `backlog-${orgId}`, name: 'Synthetic Relay', slug: `backlog-${orgId}` } });
    clientId = (await db.client.create({ data: { organizationId: orgId, name: 'Synthetic internal', kind: 'INTERNAL', slug: `internal-${orgId}` } })).id;
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  afterAll(async () => { await db.organization.delete({ where: { id: orgId } }); await db.$disconnect(); });

  it('queues qualified accounts that have never been researched, best first, and skips the rest', async () => {
    const strong = await account('strong', { screeningScore: 90 });
    const failed = await account('failed', { screeningScore: 70 });
    // Research that failed (as it does without AI credit) no longer blocks the contact step.
    await db.research.create({ data: { accountId: failed.id, organizationId: orgId, clientId, status: 'FAILED', error: 'credit balance is too low' } });
    const screenedOut = await account('out', { pipelineStage: 'SCREENED_OUT' });
    const suppressed = await account('dnc', { doNotContact: true });
    const noSite = await account('nosite', { websiteUrl: null, domain: null });

    expect(await queueContactBacklog(orgId)).toBe(2);
    const jobs = await db.job.findMany({ where: { organizationId: orgId, type: 'CONTACT_ENRICHMENT' }, orderBy: { createdAt: 'asc' } });
    expect(jobs.map((j) => j.entityId)).toEqual([strong.id, failed.id]);
    expect(jobs.every((j) => (j.payload as { resolve?: boolean }).resolve === true)).toBe(true);
    for (const skipped of [screenedOut, suppressed, noSite]) expect(jobs.some((j) => j.entityId === skipped.id)).toBe(false);
    // A second pass finds nothing new: one automatic attempt per account.
    expect(await queueContactBacklog(orgId)).toBe(0);
  });

  it('stops at the daily allowance and can be switched off', async () => {
    await account('extra-one'); await account('extra-two');
    await db.pipelineSettings.update({ where: { organizationId: orgId }, data: { maxContactLookupsPerDay: 3 } });
    expect(await queueContactBacklog(orgId)).toBe(1); // two were queued above
    expect(await queueContactBacklog(orgId)).toBe(0);
    await db.pipelineSettings.update({ where: { organizationId: orgId }, data: { maxContactLookupsPerDay: 40, autoContacts: false } });
    expect(await queueContactBacklog(orgId)).toBe(0);
  });

  it('reads the company site for published contacts once, and not again while fresh', async () => {
    const a = await account('reader');
    const pages: Record<string, string> = {
      'https://reader.test/robots.txt': 'User-agent: *\nAllow: /',
      'https://reader.test/': '<html><title>Reader Co</title><body><a href="/contact">Contact</a><p>We machine parts in Ontario for regional manufacturers.</p></body></html>',
      'https://reader.test/contact': '<html><title>Contact</title><body><a href="mailto:office@reader.test">Email</a> <a href="tel:+19055550199">Call</a></body></html>',
    };
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      const body = pages[url];
      return body === undefined ? new Response('', { status: 404 }) : new Response(body, { status: 200, headers: { 'content-type': url.endsWith('.txt') ? 'text/plain' : 'text/html' } });
    });
    vi.stubGlobal('fetch', fetcher);
    const first = await ensureWebsiteContacts(access, a.id);
    expect(first).toMatchObject({ read: true, reason: 'READ', added: 2 });
    expect(await db.contact.count({ where: { accountId: a.id, email: 'office@reader.test', source: 'COMPANY_WEBSITE' } })).toBe(1);
    expect((await db.account.findUniqueOrThrow({ where: { id: a.id } })).phone).toBe('+19055550199');
    const calls = fetcher.mock.calls.length;
    expect(await ensureWebsiteContacts(access, a.id)).toMatchObject({ read: false, reason: 'FRESH' });
    expect(fetcher.mock.calls.length).toBe(calls);
    // Another workspace cannot trigger a read of this account.
    await expect(ensureWebsiteContacts(systemAccess(randomUUID()), a.id)).rejects.toThrow('Account');
  });

  it('saves a full page of twelve contacts in one transaction', async () => {
    const a = await account('many');
    const found = Array.from({ length: 12 }, (_, i) => ({ kind: 'EMAIL' as const, value: `person${i}@many.test`, sourceUrl: 'https://many.test/team', label: 'Team' }));
    expect((await saveWebsiteContacts(access, a.id, found)).added).toBe(12);
  });
});
