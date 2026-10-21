import { describe, it, expect } from 'vitest';
import type { DiscoveredCompany } from '@/server/connectors/types';
import { GTA_DEFAULTS, MAX_QUERIES_PER_RUN, exclusionReason, nextRunAfter, planQueries, searchTerms, type PlanningProfile } from '../plan';

const profile = (over: Partial<PlanningProfile> = {}): PlanningProfile => ({
  country: 'CA', regions: ['ON'], cities: ['Mississauga', 'Brampton'], latitude: 43.65, longitude: -79.38, radiusKm: 30,
  industries: ['machine shop'], keywords: [], excludeKeywords: [], employeeMin: null, employeeMax: null, maxResultsPerRun: 60,
  ...over,
});

const company = (over: Partial<DiscoveredCompany> = {}): DiscoveredCompany => ({
  externalId: 'x', name: 'Acme Machining', websiteUrl: null, phone: null, addressLine: null, city: null, region: null, postalCode: null,
  country: 'CA', latitude: null, longitude: null, industry: null, categories: [], employeeCount: null, linkedinUrl: null,
  description: null, foundedYear: null, businessStatus: 'OPERATIONAL', sourceUrl: null, ...over,
});

describe('planQueries (text sources)', () => {
  it('searches each category in each city, naming the province', () => {
    const q = planQueries(profile({ industries: ['machine shop', 'tool and die'] }), 'text');
    expect(q.map((x) => x.text)).toEqual([
      'machine shop in Mississauga, Ontario, Canada',
      'machine shop in Brampton, Ontario, Canada',
      'tool and die in Mississauga, Ontario, Canada',
      'tool and die in Brampton, Ontario, Canada',
    ]);
    expect(q[0]).toMatchObject({ industry: 'machine shop', city: 'Mississauga', region: 'ON', pageSize: 20 });
  });

  it('uses coordinates only when no city is named', () => {
    expect(planQueries(profile(), 'text')[0]).toMatchObject({ latitude: null, longitude: null });
    const regional = planQueries(profile({ cities: [] }), 'text');
    expect(regional).toHaveLength(1);
    expect(regional[0]).toMatchObject({ text: 'machine shop in Ontario, Canada', latitude: 43.65, longitude: -79.38, radiusKm: 30 });
  });

  it('does not guess a province when several are named', () => {
    const q = planQueries(profile({ regions: ['ON', 'QC'], cities: ['Ottawa'] }), 'text');
    expect(q[0]!.text).toBe('machine shop in Ottawa, Canada');
  });

  it('treats keywords as more search terms, de-duplicated', () => {
    expect(searchTerms({ industries: ['Dentist', 'dentist '], keywords: ['orthodontist'] })).toEqual(['Dentist', 'orthodontist']);
  });

  it('caps the number of searches', () => {
    const q = planQueries(profile({ industries: Array.from({ length: 10 }, (_, i) => `cat ${i}`), cities: [...GTA_DEFAULTS.cities] }), 'text');
    expect(q).toHaveLength(MAX_QUERIES_PER_RUN);
  });

  it('plans nothing without a category or keyword', () => {
    expect(planQueries(profile({ industries: [], keywords: [] }), 'text')).toEqual([]);
  });

  it('keeps page size within the result limit', () => {
    expect(planQueries(profile({ maxResultsPerRun: 5 }), 'text')[0]!.pageSize).toBe(5);
  });
});

describe('planQueries (structured sources)', () => {
  it('makes one search across every place and term', () => {
    const q = planQueries(profile({ keywords: ['cnc'] }), 'structured');
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({
      keywords: ['machine shop', 'cnc'],
      locations: ['Mississauga, Ontario, Canada', 'Brampton, Ontario, Canada'],
      pageSize: 60,
    });
  });

  it('falls back to provinces, then the country', () => {
    expect(planQueries(profile({ cities: [] }), 'structured')[0]!.locations).toEqual(['Ontario, Canada']);
    expect(planQueries(profile({ cities: [], regions: [] }), 'structured')[0]!.locations).toEqual(['Canada']);
  });
});

describe('exclusionReason', () => {
  const rules = { excludeKeywords: ['franchise', 'auto parts'], employeeMin: 5, employeeMax: 200, country: 'CA' };

  it('keeps an ordinary match', () => {
    expect(exclusionReason(company(), rules)).toBeNull();
  });

  it('skips closed businesses', () => {
    expect(exclusionReason(company({ businessStatus: 'CLOSED_PERMANENTLY' }), rules)).toMatch(/Permanently closed/);
    expect(exclusionReason(company({ businessStatus: 'CLOSED_TEMPORARILY' }), rules)).toMatch(/Temporarily closed/);
  });

  it('skips results outside the target country, in either spelling', () => {
    expect(exclusionReason(company({ country: 'US' }), rules)).toMatch(/Outside/);
    expect(exclusionReason(company({ country: 'Canada' }), rules)).toBeNull();
  });

  it('matches excluded keywords as whole words in name, industry and categories', () => {
    expect(exclusionReason(company({ name: 'Acme Franchise Group' }), rules)).toMatch(/franchise/);
    expect(exclusionReason(company({ categories: ['auto_parts_store'] }), rules)).toMatch(/auto parts/);
    expect(exclusionReason(company({ name: 'Franchisee Supply' }), rules)).toBeNull();
  });

  it('applies size limits only when size is known', () => {
    expect(exclusionReason(company({ employeeCount: 2 }), rules)).toMatch(/Fewer than 5/);
    expect(exclusionReason(company({ employeeCount: 500 }), rules)).toMatch(/More than 200/);
    expect(exclusionReason(company({ employeeCount: null }), rules)).toBeNull();
  });
});

describe('nextRunAfter', () => {
  const from = new Date('2026-10-21T12:00:00Z');
  it('moves the schedule by the frequency', () => {
    expect(nextRunAfter('EVERY_6_HOURS', from)?.toISOString()).toBe('2026-10-21T18:00:00.000Z');
    expect(nextRunAfter('DAILY', from)?.toISOString()).toBe('2026-10-22T12:00:00.000Z');
    expect(nextRunAfter('WEEKLY', from)?.toISOString()).toBe('2026-10-28T12:00:00.000Z');
    expect(nextRunAfter('MONTHLY', from)?.toISOString()).toBe('2026-11-21T12:00:00.000Z');
    expect(nextRunAfter('MANUAL', from)).toBeNull();
  });
});
