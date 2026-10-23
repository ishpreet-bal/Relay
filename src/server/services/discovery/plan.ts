import { addDays, addHours, addMonths } from 'date-fns';
import type { DiscoveryFrequency } from '@prisma/client';
import type { DiscoveredCompany, DiscoveryQuery } from '@/server/connectors/types';

/**
 * Turning a discovery profile into searches, and deciding which results to
 * skip. Pure functions: no database, no network.
 */

export interface PlanningProfile {
  country: string;
  regions: string[];
  cities: string[];
  latitude: number | null;
  longitude: number | null;
  radiusKm: number | null;
  industries: string[];
  keywords: string[];
  excludeKeywords: string[];
  employeeMin: number | null;
  employeeMax: number | null;
  maxResultsPerRun: number;
}

/** Upper bound on the searches a profile plans. Runs work through them in turn. */
export const MAX_PLANNED_QUERIES = 400;

/** Paid search requests one run may make, however few new businesses it finds. */
export const MAX_REQUESTS_PER_RUN = 15;

/**
 * The plan starting at `offset`, wrapping around: each scheduled run picks up
 * the searches after the ones the previous run used, so a daily profile walks
 * its whole category × city grid instead of repeating the first searches.
 */
export function rotate<T>(items: T[], offset: number): T[] {
  if (!items.length) return items;
  const start = ((Math.trunc(offset) % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

/** The default market: the Greater Toronto Area and nearby Southern Ontario. */
export const GTA_DEFAULTS = {
  country: 'CA',
  regions: ['ON'],
  cities: ['Toronto', 'Mississauga', 'Brampton', 'Vaughan', 'Markham', 'Richmond Hill', 'Oakville', 'Burlington', 'Milton', 'Pickering', 'Ajax', 'Whitby', 'Oshawa', 'Hamilton'],
  latitude: 43.6532,
  longitude: -79.3832,
  radiusKm: 50,
} as const;

const REGION_NAMES: Record<string, string> = {
  ON: 'Ontario', QC: 'Quebec', BC: 'British Columbia', AB: 'Alberta', MB: 'Manitoba', SK: 'Saskatchewan',
  NS: 'Nova Scotia', NB: 'New Brunswick', NL: 'Newfoundland and Labrador', PE: 'Prince Edward Island',
  YT: 'Yukon', NT: 'Northwest Territories', NU: 'Nunavut',
};
const COUNTRY_NAMES: Record<string, string> = { CA: 'Canada', US: 'United States' };

const regionName = (r: string | null) => (r ? REGION_NAMES[r.trim().toUpperCase()] ?? r.trim() : null);
const countryName = (c: string) => COUNTRY_NAMES[c.trim().toUpperCase()] ?? c.trim();

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.map((v) => v.trim()).filter((v) => {
    const k = v.toLowerCase();
    if (!v || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** What to search for: categories first, then extra keywords. */
export function searchTerms(p: Pick<PlanningProfile, 'industries' | 'keywords'>) {
  return unique([...p.industries, ...p.keywords]);
}

export function planQueries(p: PlanningProfile, style: 'text' | 'structured'): DiscoveryQuery[] {
  const terms = searchTerms(p);
  if (!terms.length) return [];
  const country = p.country || 'CA';
  const cities = unique(p.cities);
  const regions = unique(p.regions);
  // A city's province is only certain when the profile names one.
  const cityRegion = regions.length === 1 ? regions[0]! : null;
  const base = {
    country,
    radiusKm: p.radiusKm,
    employeeMin: p.employeeMin,
    employeeMax: p.employeeMax,
    pageToken: null,
  };

  if (style === 'structured') {
    const locations = cities.length
      ? cities.map((c) => [c, regionName(cityRegion), countryName(country)].filter(Boolean).join(', '))
      : regions.length ? regions.map((r) => `${regionName(r)}, ${countryName(country)}`) : [countryName(country)];
    return [{
      ...base,
      text: `${terms.join(', ')} in ${locations.join('; ')}`,
      industry: null,
      city: null,
      region: null,
      latitude: null,
      longitude: null,
      keywords: terms,
      locations,
      pageSize: Math.min(100, Math.max(1, p.maxResultsPerRun)),
    }];
  }

  const places: Array<{ city: string | null; region: string | null }> = cities.length
    ? cities.map((city) => ({ city, region: cityRegion }))
    : regions.length ? regions.map((region) => ({ city: null, region })) : [{ city: null, region: null }];
  const queries: DiscoveryQuery[] = [];
  for (const term of terms) {
    for (const place of places) {
      const where = [place.city, regionName(place.region), countryName(country)].filter(Boolean).join(', ');
      queries.push({
        ...base,
        text: `${term} in ${where}`,
        industry: term,
        city: place.city,
        region: place.region,
        // A named city is its own location; coordinates only bias searches
        // across a whole region or country.
        latitude: place.city ? null : p.latitude,
        longitude: place.city ? null : p.longitude,
        keywords: [],
        locations: [],
        pageSize: Math.min(20, Math.max(1, p.maxResultsPerRun)),
      });
      if (queries.length >= MAX_PLANNED_QUERIES) return queries;
    }
  }
  return queries;
}

const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** Why a result should be skipped, or null to keep it. */
export function exclusionReason(c: DiscoveredCompany, p: Pick<PlanningProfile, 'excludeKeywords' | 'employeeMin' | 'employeeMax' | 'country'>): string | null {
  if (c.businessStatus === 'CLOSED_PERMANENTLY') return 'Permanently closed';
  if (c.businessStatus === 'CLOSED_TEMPORARILY') return 'Temporarily closed';
  if (p.country && c.country && c.country.trim().toUpperCase() !== p.country.trim().toUpperCase()
      && countryName(c.country).toLowerCase() !== countryName(p.country).toLowerCase()) {
    return `Outside the target country (${c.country})`;
  }
  const haystack = words([c.name, c.industry ?? '', ...c.categories.map((t) => t.replace(/_/g, ' '))].join(' '));
  const hit = p.excludeKeywords.map((k) => k.trim()).find((k) => k && haystack.includes(words(k)));
  if (hit) return `Matches excluded keyword "${hit}"`;
  if (c.employeeCount !== null) {
    if (p.employeeMin !== null && c.employeeCount < p.employeeMin) return `Fewer than ${p.employeeMin} employees`;
    if (p.employeeMax !== null && c.employeeCount > p.employeeMax) return `More than ${p.employeeMax} employees`;
  }
  return null;
}

/** When a scheduled profile should run next, or null for manual-only. */
export function nextRunAfter(frequency: DiscoveryFrequency, from: Date): Date | null {
  switch (frequency) {
    case 'EVERY_6_HOURS': return addHours(from, 6);
    case 'DAILY': return addDays(from, 1);
    case 'WEEKLY': return addDays(from, 7);
    case 'MONTHLY': return addMonths(from, 1);
    default: return null;
  }
}
