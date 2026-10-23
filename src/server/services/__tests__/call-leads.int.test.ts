import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * The no-website call list on a real Postgres, with Google stubbed: the
 * listing is looked up live, billed to the discovery budget and never
 * stored; calls move the lead along; "do not call" is final; an interested
 * business becomes an account from what it said on the call.
 */

const { dbTestsAllowed } = await import('@/test/db');
const { db } = await import('@/lib/db');
const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
const { convertLead, leadListing, listCallLeads, logLeadCall, statusAfter } = await import('../call-leads');
const { systemAccess } = await import('@/server/access/scope');

describe('call outcomes', () => {
  it('maps each outcome to where the lead stands', () => {
    expect(statusAfter('NO_ANSWER')).toBe('CALLED');
    expect(statusAfter('LEFT_MESSAGE')).toBe('CALLED');
    expect(statusAfter('CALLBACK')).toBe('CALLBACK');
    expect(statusAfter('DO_NOT_CALL')).toBe('DO_NOT_CALL');
  });
});

describe.skipIf(!reachable)('no-website call list (database)', () => {
  const orgId = randomUUID();
  let clientId = '';
  let leadId = '';
  let userId = '';
  const access = () => systemAccess(orgId);
  const listing = { id: 'place-corner-salon', displayName: { text: 'Corner Salon' }, nationalPhoneNumber: '(905) 555-0142', internationalPhoneNumber: '+1 905-555-0142', formattedAddress: '1 Main St, Brampton, ON', googleMapsUri: 'https://maps.google.com/?cid=1', businessStatus: 'OPERATIONAL', primaryTypeDisplayName: { text: 'Hair salon' }, rating: 4.6, userRatingCount: 31 };
  const google = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toBe('https://places.googleapis.com/v1/places/place-corner-salon');
    expect((init?.headers as Record<string, string>)['x-goog-fieldmask']).toContain('nationalPhoneNumber');
    return Response.json(listing);
  });

  beforeAll(async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    process.env.GOOGLE_PLACES_DETAILS_COST_MILLICENTS = '2500';
    await db.organization.create({ data: { id: orgId, clerkOrgId: `test_${orgId}`, name: 'Call list test', slug: `calls-${orgId.slice(0, 8)}` } });
    userId = (await db.user.create({ data: { clerkUserId: `test_${orgId}_u`, email: `calls-${orgId.slice(0, 8)}@example.test` } })).id;
    clientId = (await db.client.create({ data: { organizationId: orgId, name: 'Relay', slug: `relay-${orgId.slice(0, 6)}`, kind: 'INTERNAL' } })).id;
    leadId = (await db.callLead.create({ data: { organizationId: orgId, clientId, provider: 'google_places', externalId: 'place-corner-salon', reason: 'NO_WEBSITE', searchTerm: 'hair salon', searchCity: 'Brampton', searchRegion: 'ON' } })).id;
  });

  afterAll(async () => {
    if (reachable) {
      await db.organization.delete({ where: { id: orgId } }).catch(() => undefined);
      await db.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await db.$disconnect();
  });

  it('looks the listing up live, bills it, and stores none of it', async () => {
    const r = await leadListing(access(), leadId, google as never);
    expect(r.listing).toMatchObject({ name: 'Corner Salon', phone: '(905) 555-0142', address: '1 Main St, Brampton, ON', rating: 4.6 });
    expect(r.attribution).toMatch(/Google Maps/);
    const usage = await db.usageRecord.findMany({ where: { organizationId: orgId } });
    expect(usage).toEqual([expect.objectContaining({ type: 'DISCOVERY_REQUEST', operation: 'google_places.details', costMillicents: 2500, isEstimate: true })]);
    const stored = await db.callLead.findUniqueOrThrow({ where: { id: leadId } });
    expect(JSON.stringify(stored)).not.toMatch(/Corner Salon|555-0142|Main St/);
  });

  it('moves the lead with each call and keeps the notes', async () => {
    await expect(logLeadCall(access(), userId, leadId, { outcome: 'CALLBACK' })).rejects.toThrow(/when to call back/);
    const when = new Date(Date.now() + 86_400_000);
    await logLeadCall(access(), userId, leadId, { outcome: 'CALLBACK', notes: 'Owner in tomorrow', callbackAt: when });
    const lead = await db.callLead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead).toMatchObject({ status: 'CALLBACK', calls: 1, lastCalledById: userId });
    expect(lead.callbackAt?.getTime()).toBe(when.getTime());
    expect(lead.notes).toMatch(/callback: Owner in tomorrow/);
    const list = await listCallLeads(access(), { status: 'CALLBACK' });
    expect(list.items.map((l) => l.id)).toEqual([leadId]);
    expect(list.counts).toMatchObject({ CALLBACK: 1 });
  });

  it('turns an interested business into an account from what it said, with consent recorded', async () => {
    await logLeadCall(access(), userId, leadId, { outcome: 'INTERESTED', notes: 'Wants online booking' });
    const r = await convertLead(access(), userId, leadId, { name: 'Corner Salon', phone: '(905) 555-0142', contactFirstName: 'Dana', contactTitle: 'Owner', contactEmail: 'dana@corner-salon.test', agreedToEmail: true });
    expect(r.created).toBe(true);
    const account = await db.account.findUniqueOrThrow({ where: { id: r.accountId }, include: { contacts: true, identifiers: true } });
    expect(account).toMatchObject({ name: 'Corner Salon', city: 'Brampton', industry: 'hair salon', source: 'MANUAL' });
    expect(account.identifiers).toEqual([expect.objectContaining({ provider: 'google_places', externalId: 'place-corner-salon' })]);
    expect(account.contacts[0]).toMatchObject({ firstName: 'Dana', email: 'dana@corner-salon.test', consentBasis: 'EXPRESS' });
    expect((await db.callLead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe('CONVERTED');
    // Converting again returns the same account.
    expect(await convertLead(access(), userId, leadId, { name: 'Corner Salon' })).toEqual({ accountId: r.accountId, created: false });
  });

  it('never looks up or calls a business that asked not to be called', async () => {
    const other = await db.callLead.create({ data: { organizationId: orgId, clientId, provider: 'google_places', externalId: 'place-no-calls', reason: 'SOCIAL_ONLY' } });
    await logLeadCall(access(), userId, other.id, { outcome: 'DO_NOT_CALL' });
    await expect(leadListing(access(), other.id, google as never)).rejects.toThrow(/asked not to be called/);
    await expect(convertLead(access(), userId, other.id, { name: 'X' })).rejects.toThrow(/asked not to be called/);
  });
});
