import { afterEach, describe, it, expect, vi } from 'vitest';
import { googlePlacesConnector, mapsUrl, searchBody, toCompany } from '@/server/connectors/providers/google-places';
import { apolloConnector, employeeRange } from '@/server/connectors/providers/apollo';
import type { DiscoveryQuery } from '@/server/connectors/types';

const query: DiscoveryQuery = {
  text: 'machine shop in Mississauga, Ontario, Canada', industry: 'machine shop', city: 'Mississauga', region: 'ON', country: 'CA',
  latitude: null, longitude: null, radiusKm: null, employeeMin: null, employeeMax: null, keywords: [], locations: [], pageSize: 20, pageToken: null,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Google Places adapter', () => {
  it('maps a place to business facts and builds the Maps link from the id', () => {
    const c = toCompany({
      id: 'ChIJ123', displayName: { text: 'Acme Machining' }, websiteUri: 'https://acme.example/', nationalPhoneNumber: '(905) 555-0101',
      location: { latitude: 43.59, longitude: -79.64 }, primaryType: 'machine_shop', businessStatus: 'OPERATIONAL', types: ['point_of_interest', 'machine_shop'],
      addressComponents: [
        { longText: '12', shortText: '12', types: ['street_number'] }, { longText: 'Dundas Street East', types: ['route'] },
        { longText: 'Mississauga', types: ['locality'] }, { longText: 'Ontario', shortText: 'ON', types: ['administrative_area_level_1'] },
        { longText: 'Canada', shortText: 'CA', types: ['country'] }, { longText: 'L5A 1W2', types: ['postal_code'] },
      ],
    });
    expect(c).toMatchObject({
      externalId: 'ChIJ123', name: 'Acme Machining', addressLine: '12 Dundas Street East', city: 'Mississauga', region: 'ON', country: 'CA',
      postalCode: 'L5A 1W2', industry: 'Machine shop', categories: ['machine_shop'], sourceUrl: mapsUrl('ChIJ123'),
    });
  });

  it('skips nameless places', () => {
    expect(toCompany({ id: 'x' })).toBeNull();
  });

  it('biases by circle only with coordinates, and caps the radius at 50 km', () => {
    expect(searchBody(query)).not.toHaveProperty('locationBias');
    const body = searchBody({ ...query, latitude: 43.6, longitude: -79.4, radiusKm: 80, pageToken: 'next' });
    expect(body).toMatchObject({ locationBias: { circle: { radius: 50_000 } }, pageToken: 'next', regionCode: 'CA', pageSize: 20 });
  });

  it('searches with the field mask and key headers and charges the configured estimate', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'test-key');
    vi.stubEnv('GOOGLE_PLACES_COST_PER_REQUEST_MILLICENTS', '3200');
    const fetch = vi.fn<FetchLike>(async () => json({ places: [{ id: 'p1', displayName: { text: 'Acme' } }], nextPageToken: 'tok' }));
    vi.stubGlobal('fetch', fetch);
    const r = await googlePlacesConnector.discovery!.search(query);
    expect(r).toMatchObject({ status: 'SUCCESS', costMillicents: 3200, data: { nextPageToken: 'tok' } });
    const init = fetch.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('test-key');
    expect(headers['x-goog-fieldmask']).toContain('places.websiteUri');
    expect(headers['x-goog-fieldmask']).toContain('nextPageToken');
    // Raw Places content is not handed back for the provider log.
    expect(JSON.stringify(r.raw)).not.toContain('Acme');
  });

  it('reports API errors without charging', async () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'bad');
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { code: 403, message: 'Places API (New) has not been used in project' } }, 403)));
    const r = await googlePlacesConnector.discovery!.search(query);
    expect(r).toMatchObject({ status: 'ERROR', costMillicents: 0 });
    expect(r.error).toMatch(/403: Places API \(New\) has not been used/);
  });
});

describe('Apollo company search adapter', () => {
  it('builds employee ranges', () => {
    expect(employeeRange(null, null)).toEqual([]);
    expect(employeeRange(10, 200)).toEqual(['10,200']);
    expect(employeeRange(null, 50)).toEqual(['1,50']);
  });

  it('searches by location, keyword and size and pages by number', async () => {
    vi.stubEnv('APOLLO_API_KEY', 'k');
    vi.stubEnv('APOLLO_COST_PER_CREDIT_MILLICENTS', '2000');
    const fetch = vi.fn<FetchLike>(async () => json({
      organizations: [{ id: 'o1', name: 'Acme Machining', primary_domain: 'acme.example', estimated_num_employees: 40, city: 'Mississauga', state: 'Ontario', country: 'Canada' }],
      pagination: { page: 1, total_pages: 3 },
    }));
    vi.stubGlobal('fetch', fetch);
    const r = await apolloConnector.discovery!.search({ ...query, keywords: ['machine shop'], locations: ['Mississauga, Ontario, Canada'], employeeMin: 10, employeeMax: 200, pageSize: 100 });
    const body = JSON.parse(String(fetch.mock.calls[0]![1]!.body));
    expect(body).toMatchObject({ organization_locations: ['Mississauga, Ontario, Canada'], q_organization_keyword_tags: ['machine shop'], organization_num_employees_ranges: ['10,200'], page: 1, per_page: 100 });
    expect(r).toMatchObject({ status: 'SUCCESS', costMillicents: 2000, data: { nextPageToken: '2' } });
    expect(r.data!.companies[0]).toMatchObject({ externalId: 'o1', websiteUrl: 'https://acme.example', employeeCount: 40, region: 'Ontario' });
  });
});
