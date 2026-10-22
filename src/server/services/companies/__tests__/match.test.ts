import { describe, it, expect } from 'vitest';
import { MATCH_THRESHOLD, REVIEW_THRESHOLD, decide, fillableFields, scoreMatch, type CompanyIdentity } from '../match';

const base: CompanyIdentity = {
  normalizedName: 'maple plastics',
  domain: null,
  city: 'Mississauga',
  region: 'ON',
  address: null,
  phone: null,
  identifiers: [],
  emailDomains: [],
};
const company = (over: Partial<CompanyIdentity>): CompanyIdentity => ({ ...base, ...over });

describe('scoreMatch', () => {
  it('matches on a shared provider id', () => {
    const id = [{ provider: 'GOOGLE_PLACES', externalId: 'ChIJ123' }];
    const s = scoreMatch(company({ identifiers: id, normalizedName: 'x' }), company({ identifiers: id, normalizedName: 'y', city: 'Toronto' }));
    expect(s.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    expect(s.reasons[0]!.code).toBe('IDENTIFIER');
  });

  it('matches on the same company domain', () => {
    const s = scoreMatch(company({ domain: 'maple.ca' }), company({ domain: 'maple.ca', normalizedName: 'maple plastics group' }));
    expect(s.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it('matches when a known contact uses the incoming domain', () => {
    const s = scoreMatch(company({ domain: 'maple.ca', normalizedName: 'mp' }), company({ emailDomains: ['maple.ca'], normalizedName: 'other' }));
    expect(s.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it('matches the same name in the same city', () => {
    const s = scoreMatch(company({}), company({ city: 'mississauga', region: 'Ontario' }));
    expect(s.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it('sends the same name at a different address in the same city to review, not auto-merge', () => {
    // Two locations of a chain are not the same account.
    const s = scoreMatch(company({ address: '1 main st' }), company({ address: '200 queen st' }));
    expect(s.score).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
    expect(s.score).toBeLessThan(MATCH_THRESHOLD);
  });

  it('sends the same name in a different city to review', () => {
    const s = scoreMatch(company({}), company({ city: 'Hamilton' }));
    expect(s.score).toBeGreaterThanOrEqual(REVIEW_THRESHOLD);
    expect(s.score).toBeLessThan(MATCH_THRESHOLD);
  });

  it('treats two different company domains as different companies', () => {
    const s = scoreMatch(company({ domain: 'maple.ca' }), company({ domain: 'mapleplastics.com' }));
    expect(s.conflict).toMatch(/Different websites/);
    expect(s.score).toBeLessThan(REVIEW_THRESHOLD);
  });

  it('lets a shared provider id override a domain conflict', () => {
    const id = [{ provider: 'APOLLO', externalId: 'a1' }];
    const s = scoreMatch(company({ domain: 'maple.ca', identifiers: id }), company({ domain: 'mapleplastics.com', identifiers: id }));
    expect(s.conflict).toBeNull();
    expect(s.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it('boosts independent agreeing evidence', () => {
    const one = scoreMatch(company({ phone: '4165550101', normalizedName: 'a' }), company({ phone: '4165550101', normalizedName: 'b', city: 'x' }));
    // Same name in the same province (0.8) plus the same phone (0.8).
    const two = scoreMatch(company({ phone: '4165550101' }), company({ phone: '4165550101', city: null, region: 'Ontario' }));
    expect(two.score).toBeGreaterThan(one.score);
    expect(two.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it('ignores short phone fragments', () => {
    const s = scoreMatch(company({ phone: '5550101', normalizedName: 'a' }), company({ phone: '5550101', normalizedName: 'b' }));
    expect(s.score).toBe(0);
  });

  it('keeps unrelated companies apart', () => {
    const s = scoreMatch(company({}), company({ normalizedName: 'northern logistics' }));
    expect(s.score).toBe(0);
    expect(s.reasons).toHaveLength(0);
  });
});

describe('decide', () => {
  const score = (n: number) => ({ score: n, reasons: [], conflict: null });

  it('picks the best candidate', () => {
    const d = decide([{ item: 'a', score: score(0.7) }, { item: 'b', score: score(0.95) }]);
    expect(d).toMatchObject({ action: 'match', match: 'b' });
  });

  it('asks a person between the thresholds', () => {
    expect(decide([{ item: 'a', score: score(0.7) }])).toMatchObject({ action: 'review', match: 'a' });
  });

  it('creates a new record below review or with no candidates', () => {
    expect(decide([{ item: 'a', score: score(0.4) }])).toEqual({ action: 'new' });
    expect(decide([])).toEqual({ action: 'new' });
  });
});

describe('fillableFields', () => {
  it('fills only empty fields and never overwrites', () => {
    const existing = { phone: null as string | null, city: 'Toronto', tags: [] as string[], industry: '' };
    const incoming = { phone: '4165550101', city: 'Mississauga', tags: ['x'], industry: 'Plastics' };
    expect(fillableFields(existing, incoming, ['phone', 'city', 'tags', 'industry'])).toEqual({
      phone: '4165550101', tags: ['x'], industry: 'Plastics',
    });
  });

  it('ignores empty incoming values', () => {
    expect(fillableFields({ phone: null as string | null }, { phone: '' }, ['phone'])).toEqual({});
  });
});
