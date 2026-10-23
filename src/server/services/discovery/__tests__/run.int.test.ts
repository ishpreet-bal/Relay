import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * A discovery run end to end against a real (migrated) Postgres: Google
 * Places and the businesses' websites are stubbed at fetch(), everything
 * else — matching, provenance, usage, results, budget, resume — is the real
 * code. Skipped when no database is reachable.
 */

vi.mock('node:dns/promises', () => ({ lookup: async () => [{ address: '93.184.216.34', family: 4 }] }));

const { dbTestsAllowed } = await import('@/test/db');
const { db } = await import('@/lib/db');
const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);

const { startDiscoveryRun, executeDiscoveryStep } = await import('../run');
const { sweepRetention } = await import('../retention');
const { systemAccess } = await import('@/server/access/scope');

const PLACES = [
  // A business with its own site and schema.org data.
  { id: 'place-acme', displayName: { text: 'Acme Machining' }, websiteUri: 'https://acme-machining.test/', businessStatus: 'OPERATIONAL',
    location: { latitude: 43.59, longitude: -79.64 }, addressComponents: [{ longText: 'Canada', shortText: 'CA', types: ['country'] }] },
  // No website: nothing first-party to build from.
  { id: 'place-nosite', displayName: { text: 'Mystery Fabrication' }, businessStatus: 'OPERATIONAL' },
  // A Facebook page instead of a website.
  { id: 'place-fb', displayName: { text: 'Shop On Facebook' }, websiteUri: 'https://www.facebook.com/shoponfb', businessStatus: 'OPERATIONAL' },
  // A listing pointing at someone else's site.
  { id: 'place-wrong', displayName: { text: 'Precision Tool & Die' }, websiteUri: 'https://unrelated.test/', businessStatus: 'OPERATIONAL' },
  // Closed.
  { id: 'place-closed', displayName: { text: 'Gone Machining' }, websiteUri: 'https://gone.test/', businessStatus: 'CLOSED_PERMANENTLY' },
];

const OTTAWA_PLACE = { id: 'place-capital', displayName: { text: 'Capital CNC' }, websiteUri: 'https://capital-cnc.test/', businessStatus: 'OPERATIONAL' };

const ACME_HOME = `<!doctype html><html><head><title>Acme Machining Inc. | CNC in Mississauga</title>
<script type="application/ld+json">${JSON.stringify({
  '@type': 'LocalBusiness', name: 'Acme Machining Inc.', telephone: '(905) 555-0101',
  address: { streetAddress: '12 Dundas St E', addressLocality: 'Mississauga', addressRegion: 'ON', postalCode: 'L5A 1W2', addressCountry: 'CA' },
})}</script></head><body><h1>Acme Machining</h1></body></html>`;

let placesCalls = 0;
/** Visits to Acme's homepage. */
let siteCalls = 0;
const fetchStub = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const html = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
  if (url.startsWith('https://places.googleapis.com/')) {
    placesCalls++;
    const body = JSON.parse(String(init?.body ?? '{}'));
    if (String(body.textQuery ?? '').includes('Ottawa')) return Response.json({ places: [OTTAWA_PLACE] });
    // Two pages for the first query; one for the rest.
    if (!body.pageToken && placesCalls === 1) return Response.json({ places: PLACES.slice(0, 3), nextPageToken: 'page-2' });
    if (body.pageToken === 'page-2') return Response.json({ places: PLACES.slice(3) });
    return Response.json({ places: PLACES.slice(0, 1) });
  }
  if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
  if (url.startsWith('https://acme-machining.test')) { siteCalls++; return html(ACME_HOME); }
  if (url.startsWith('https://capital-cnc.test')) return html('<html><head><title>Capital CNC | Machine shop in Ottawa</title></head><body><h1>Capital CNC</h1></body></html>');
  if (url.startsWith('https://unrelated.test')) return html('<html><head><title>Northern Freight Logistics</title></head><body>Trucking</body></html>');
  return new Response('not found', { status: 404 });
});

describe.skipIf(!reachable)('discovery run (database)', () => {
  const orgId = randomUUID();
  let clientId = '';
  let profileId = '';

  beforeAll(async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    process.env.GOOGLE_PLACES_COST_PER_REQUEST_MILLICENTS = '3500';
    vi.stubGlobal('fetch', fetchStub);
    await db.organization.create({ data: { id: orgId, clerkOrgId: `test_${orgId}`, name: 'Discovery Test Org', slug: `discovery-test-${orgId.slice(0, 8)}` } });
    const client = await db.client.create({ data: { organizationId: orgId, name: 'House', slug: 'house' } });
    clientId = client.id;
    const profile = await db.discoveryProfile.create({
      data: {
        organizationId: orgId, clientId, name: 'GTA machine shops', sources: ['google_places'], country: 'CA', regions: ['ON'],
        cities: ['Mississauga', 'Brampton'], industries: ['machine shop'], maxResultsPerRun: 50, monthlyBudgetCents: 100, frequency: 'MANUAL',
      },
    });
    profileId = profile.id;
  });

  beforeEach(() => { placesCalls = 0; siteCalls = 0; });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (reachable) await db.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await db.$disconnect();
  });

  it('builds accounts from first-party websites and records every outcome', async () => {
    const { run, started } = await startDiscoveryRun(systemAccess(orgId), null, profileId, 'MANUAL');
    expect(started).toBe(true);
    expect(await executeDiscoveryStep(run.id, { deadline: Date.now() + 120_000 })).toEqual({ done: true });

    const done = await db.discoveryRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(done).toMatchObject({ status: 'COMPLETED', found: 5, imported: 1, excluded: 4, queriesRun: 3, costMillicents: 3 * 3500 });

    const accounts = await db.account.findMany({ where: { clientId }, include: { identifiers: true } });
    expect(accounts).toHaveLength(1);
    const acme = accounts[0]!;
    // Every stored detail is the website's, not the listing's.
    expect(acme).toMatchObject({
      name: 'Acme Machining Inc.', domain: 'acme-machining.test', phone: '(905) 555-0101', addressLine: '12 Dundas St E',
      city: 'Mississauga', region: 'ON', postalCode: 'L5A 1W2', source: 'GOOGLE_PLACES', industry: 'machine shop', discoveryRunId: run.id,
    });
    expect(acme.identifiers).toEqual([expect.objectContaining({ provider: 'google_places', externalId: 'place-acme' })]);

    const provenance = await db.dataProvenance.findMany({ where: { accountId: acme.id, isCurrent: true } });
    const by = Object.fromEntries(provenance.map((p) => [p.field, p]));
    expect(by.phone).toMatchObject({ source: 'COMPANY_WEBSITE', retentionUntil: null });
    expect(by.industry).toMatchObject({ source: 'OTHER', provider: 'discovery_search', status: 'UNVERIFIED' });
    // Coordinates are the only Places content kept, with a 30-day limit.
    expect(by.latitude).toMatchObject({ source: 'GOOGLE_PLACES' });
    expect(by.latitude!.retentionUntil!.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);

    const results = await db.discoveryResult.findMany({ where: { runId: run.id }, orderBy: { externalId: 'asc' } });
    const outcome = Object.fromEntries(results.map((r) => [r.externalId, r]));
    expect(outcome['place-acme']).toMatchObject({ outcome: 'CREATED', accountId: acme.id });
    expect(outcome['place-nosite']).toMatchObject({ outcome: 'EXCLUDED', name: '' });
    expect(outcome['place-nosite']!.reason).toMatch(/No website/);
    expect(outcome['place-fb']!.reason).toMatch(/social media/);
    expect(outcome['place-wrong']!.reason).toMatch(/doesn't confirm/);
    expect(outcome['place-closed']!.reason).toMatch(/Permanently closed/);
    // No Places name is stored for businesses that weren't confirmed.
    expect(results.filter((r) => r.outcome === 'EXCLUDED').every((r) => r.name === '')).toBe(true);

    const usage = await db.usageRecord.findMany({ where: { organizationId: orgId, type: 'DISCOVERY_REQUEST' } });
    expect(usage).toHaveLength(3);
    expect(usage.every((u) => u.isEstimate && u.costMillicents === 3500)).toBe(true);
  });

  it('recognises known businesses by place id on the next run, without visiting their site again', async () => {
    const { run } = await startDiscoveryRun(systemAccess(orgId), null, profileId, 'MANUAL');
    await executeDiscoveryStep(run.id, { deadline: Date.now() + 120_000 });
    const done = await db.discoveryRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(done.imported).toBe(0);
    expect(done.duplicates).toBeGreaterThanOrEqual(1);
    expect(await db.account.count({ where: { clientId, deletedAt: null } })).toBe(1);
    const acme = await db.discoveryResult.findFirstOrThrow({ where: { runId: run.id, externalId: 'place-acme' } });
    expect(acme.outcome).toBe('DUPLICATE');
    expect(siteCalls).toBe(0);
  });

  it('pauses at the deadline and resumes from its cursor without repeating paid searches', async () => {
    await db.account.deleteMany({ where: { clientId } });
    const { run } = await startDiscoveryRun(systemAccess(orgId), null, profileId, 'MANUAL');
    // No time left: it saves a cursor before the first search.
    expect(await executeDiscoveryStep(run.id, { deadline: Date.now() })).toEqual({ done: false });
    expect(placesCalls).toBe(0);
    expect(await executeDiscoveryStep(run.id, { deadline: Date.now() + 120_000 })).toEqual({ done: true });
    expect(placesCalls).toBe(3);
    const done = await db.discoveryRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(done).toMatchObject({ status: 'COMPLETED', queriesRun: 3 });
  });

  it('stops before a search would exceed the monthly budget', async () => {
    // Three runs at 10.5 cents each have used 31.5 cents; one more 3.5-cent
    // search would make 35, over a 34-cent budget.
    await db.discoveryProfile.update({ where: { id: profileId }, data: { monthlyBudgetCents: 34 } });
    const { run, started } = await startDiscoveryRun(systemAccess(orgId), null, profileId, 'MANUAL');
    expect(started).toBe(true);
    await executeDiscoveryStep(run.id, { deadline: Date.now() + 120_000 });
    const done = await db.discoveryRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(done.queriesRun).toBe(0);
    expect((done.details as { stopReason?: string }).stopReason).toMatch(/budget/);
    // Once used up, new runs are refused up front and the refusal is recorded.
    await db.discoveryProfile.update({ where: { id: profileId }, data: { monthlyBudgetCents: 30 } });
    const refused = await startDiscoveryRun(systemAccess(orgId), null, profileId, 'MANUAL');
    expect(refused).toMatchObject({ started: false, run: { status: 'CANCELLED' } });
  });

  it('removes cached coordinates once their retention date passes', async () => {
    const account = await db.account.findFirstOrThrow({ where: { clientId, latitude: { not: null } } });
    await db.dataProvenance.updateMany({ where: { accountId: account.id, field: { in: ['latitude', 'longitude'] } }, data: { retentionUntil: new Date(Date.now() - 1000) } });
    await sweepRetention();
    const after = await db.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(after).toMatchObject({ latitude: null, longitude: null, phone: '(905) 555-0101' });
    const cached = await db.dataProvenance.findMany({ where: { accountId: account.id, field: 'latitude' } });
    expect(cached.every((p) => p.value === null && !p.isCurrent)).toBe(true);
  });

  it('counts only new businesses and starts each run where the previous one stopped', async () => {
    const profile = await db.discoveryProfile.create({
      data: {
        organizationId: orgId, clientId, name: 'Rotation', sources: ['google_places'], country: 'CA', regions: ['ON'],
        cities: ['Toronto', 'Ottawa', 'Kingston'], industries: ['machine shop'], maxResultsPerRun: 1, monthlyBudgetCents: 100, frequency: 'MANUAL',
      },
    });
    // Toronto returns only businesses already on file or excluded; Ottawa has one new business.
    const first = await startDiscoveryRun(systemAccess(orgId), null, profile.id, 'MANUAL');
    await executeDiscoveryStep(first.run.id, { deadline: Date.now() + 120_000 });
    const a = await db.discoveryRun.findUniqueOrThrow({ where: { id: first.run.id } });
    expect(a).toMatchObject({ status: 'COMPLETED', imported: 1 });
    expect(a.found).toBeGreaterThan(1);
    const detailsA = a.details as { stopReason: string; nextOffsets: Record<string, number> };
    expect(detailsA.stopReason).toMatch(/1 new businesses/);
    // Toronto and Ottawa are done; the next run begins with Kingston.
    expect(detailsA.nextOffsets.google_places).toBe(2);

    const second = await startDiscoveryRun(systemAccess(orgId), null, profile.id, 'MANUAL');
    await executeDiscoveryStep(second.run.id, { deadline: Date.now() + 120_000 });
    const firstSearch = await db.usageRecord.findFirstOrThrow({
      where: { organizationId: orgId, type: 'DISCOVERY_REQUEST', metadata: { path: ['runId'], equals: second.run.id } },
      orderBy: { occurredAt: 'asc' },
    });
    expect((firstSearch.metadata as { query: string }).query).toMatch(/Kingston/);
  });
});
