import { z } from 'zod';
import type { ConnectorDefinition, DiscoveredCompany, DiscoveryProvider, DiscoveryQuery, ProviderResult } from '../types';

/**
 * Google Places API (New), Text Search: finds businesses by category and
 * place ("machine shop in Mississauga, ON").
 *
 * Storage. Google's Maps Platform terms let a place id be stored
 * indefinitely and latitude/longitude be cached for up to 30 days; other
 * Places content (name, address, phone, website) has no caching exception.
 * So Relay uses Places to *find* businesses, not as a source of record:
 *   - the place id is kept as the account's identifier (dedupe, refresh);
 *   - coordinates are kept with a 30-day retention date and removed by the
 *     retention sweep;
 *   - everything else on the account comes from the business's own website,
 *     read during the same run (services/discovery/site-identity.ts). The
 *     Places values are used only in memory to locate and check that site.
 * Raw Places responses are not written to the provider log.
 *
 * Billing. The field mask decides the SKU: websiteUri and phone numbers put
 * a request in the Enterprise tier. Each page is a billed request. The
 * per-request figure is configurable because prices and free allowances
 * change, and every cost recorded from it is marked as an estimate.
 */

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';

// websiteUri is what makes Places useful here (it leads to the first-party
// record) and is an Enterprise-tier field; phone numbers are in the same tier
// and only used to cross-check the site.
const FIELDS = [
  'places.id', 'places.displayName', 'places.addressComponents', 'places.location', 'places.websiteUri',
  'places.nationalPhoneNumber', 'places.types', 'places.primaryType', 'places.businessStatus', 'nextPageToken',
].join(',');

/** Days Places coordinates may be cached. */
export const PLACES_RETENTION_DAYS = 30;

// Text Search Enterprise list price: US$35 per 1,000 requests in the first
// paid band (1,000 free requests a month per SKU are not netted out here).
// Override with GOOGLE_PLACES_COST_PER_REQUEST_MILLICENTS (1 cent = 1,000).
const DEFAULT_REQUEST_MILLICENTS = 3_500;

function apiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY is not configured');
  return key;
}

function requestCost() {
  const configured = Number(process.env.GOOGLE_PLACES_COST_PER_REQUEST_MILLICENTS);
  const valid = Number.isFinite(configured) && configured >= 0 && process.env.GOOGLE_PLACES_COST_PER_REQUEST_MILLICENTS !== undefined;
  // Even a configured figure is the list price, not what Google invoices
  // after free allowances, so it stays an estimate.
  return { millicents: valid ? configured : DEFAULT_REQUEST_MILLICENTS, isEstimate: true };
}

const text = z.object({ text: z.string().nullish() }).partial().nullish();
const component = z.object({ longText: z.string().nullish(), shortText: z.string().nullish(), types: z.array(z.string()).nullish() });
const placeSchema = z.object({
  id: z.string(),
  displayName: text,
  formattedAddress: z.string().nullish(),
  addressComponents: z.array(component).nullish(),
  location: z.object({ latitude: z.number(), longitude: z.number() }).nullish(),
  websiteUri: z.string().nullish(),
  nationalPhoneNumber: z.string().nullish(),
  internationalPhoneNumber: z.string().nullish(),
  types: z.array(z.string()).nullish(),
  primaryType: z.string().nullish(),
  primaryTypeDisplayName: text,
  businessStatus: z.string().nullish(),
  googleMapsUri: z.string().nullish(),
}).passthrough();
const responseSchema = z.object({ places: z.array(placeSchema).nullish(), nextPageToken: z.string().nullish() });

type Place = z.infer<typeof placeSchema>;

function part(place: Place, type: string, form: 'longText' | 'shortText' = 'longText') {
  const c = place.addressComponents?.find((a) => a.types?.includes(type));
  return c?.[form] ?? null;
}

/** "chinese_restaurant" → "Chinese restaurant". */
function humanType(type: string | null | undefined) {
  if (!type) return null;
  const words = type.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Google's documented link format for opening a place by id. */
export function mapsUrl(placeId: string) {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
}

export function toCompany(place: Place): DiscoveredCompany | null {
  const name = place.displayName?.text?.trim();
  if (!name) return null;
  const street = [part(place, 'street_number'), part(place, 'route')].filter(Boolean).join(' ');
  const unit = part(place, 'subpremise');
  return {
    externalId: place.id,
    name,
    websiteUrl: place.websiteUri ?? null,
    phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null,
    addressLine: street ? (unit ? `${unit}-${street}` : street) : null,
    city: part(place, 'locality') ?? part(place, 'postal_town') ?? part(place, 'sublocality') ?? part(place, 'administrative_area_level_3'),
    region: part(place, 'administrative_area_level_1', 'shortText'),
    postalCode: part(place, 'postal_code'),
    country: part(place, 'country', 'shortText'),
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null,
    industry: place.primaryTypeDisplayName?.text ?? humanType(place.primaryType),
    categories: (place.types ?? []).filter((t) => t !== 'point_of_interest' && t !== 'establishment').slice(0, 10),
    employeeCount: null,
    linkedinUrl: null,
    description: null,
    foundedYear: null,
    businessStatus: place.businessStatus ?? null,
    // Built from the place id, which may be stored, rather than kept from the response.
    sourceUrl: mapsUrl(place.id),
  };
}

// Place Details with a phone number is an Enterprise-tier request. Google's
// price per lookup is configurable (GOOGLE_PLACES_DETAILS_COST_MILLICENTS)
// and every recorded cost from it is an estimate.
const DEFAULT_DETAILS_MILLICENTS = 2_500;
const DETAILS_FIELDS = [
  'id', 'displayName', 'formattedAddress', 'nationalPhoneNumber', 'internationalPhoneNumber', 'websiteUri',
  'googleMapsUri', 'businessStatus', 'primaryTypeDisplayName', 'rating', 'userRatingCount',
].join(',');

export function detailsCost() {
  const configured = Number(process.env.GOOGLE_PLACES_DETAILS_COST_MILLICENTS);
  const valid = Number.isFinite(configured) && configured >= 0 && process.env.GOOGLE_PLACES_DETAILS_COST_MILLICENTS !== undefined;
  return { millicents: valid ? configured : DEFAULT_DETAILS_MILLICENTS, isEstimate: true };
}

export interface PlaceListing {
  name: string | null;
  phone: string | null;
  internationalPhone: string | null;
  address: string | null;
  websiteUrl: string | null;
  mapsUrl: string;
  businessStatus: string | null;
  category: string | null;
  rating: number | null;
  ratingCount: number | null;
}

/**
 * One business's current Google listing, for display only. Places content
 * may not be stored, so callers show it and let it go; only the place id is
 * kept.
 */
export async function placeListing(placeId: string, fetchImpl: typeof fetch = fetch): Promise<PlaceListing> {
  const res = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { 'x-goog-api-key': apiKey(), 'x-goog-fieldmask': DETAILS_FIELDS },
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await res.text();
  let json: unknown = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { /* non-JSON error page */ }
  if (!res.ok) throw new Error(errorMessage({ status: res.status, json, text: raw.slice(0, 500) }));
  const place = placeSchema.extend({ rating: z.number().nullish(), userRatingCount: z.number().nullish() }).parse(json);
  return {
    name: place.displayName?.text?.trim() || null,
    phone: place.nationalPhoneNumber ?? null,
    internationalPhone: place.internationalPhoneNumber ?? null,
    address: place.formattedAddress ?? null,
    websiteUrl: place.websiteUri ?? null,
    mapsUrl: place.googleMapsUri ?? mapsUrl(place.id),
    businessStatus: place.businessStatus ?? null,
    category: place.primaryTypeDisplayName?.text ?? null,
    rating: place.rating ?? null,
    ratingCount: place.userRatingCount ?? null,
  };
}

async function post(body: unknown, fieldMask: string) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey(), 'x-goog-fieldmask': fieldMask },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await res.text();
  let json: unknown = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { /* non-JSON error page */ }
  return { ok: res.ok, status: res.status, json, text: raw.slice(0, 500) };
}

function errorMessage(r: { status: number; json: unknown; text: string }) {
  const message = (r.json as { error?: { message?: string } } | null)?.error?.message;
  return `Google Places responded ${r.status}: ${message ?? r.text}`;
}

export function searchBody(q: DiscoveryQuery) {
  return {
    textQuery: q.text,
    pageSize: Math.min(20, Math.max(1, q.pageSize)),
    languageCode: 'en',
    regionCode: q.country || undefined,
    ...(q.latitude !== null && q.longitude !== null
      ? { locationBias: { circle: { center: { latitude: q.latitude, longitude: q.longitude }, radius: Math.min(50_000, Math.max(1_000, (q.radiusKm ?? 25) * 1000)) } } }
      : {}),
    ...(q.pageToken ? { pageToken: q.pageToken } : {}),
  };
}

const discovery: DiscoveryProvider = {
  source: 'GOOGLE_PLACES',
  queryStyle: 'text',
  storage: 'locate-only',
  coordinateRetentionDays: PLACES_RETENTION_DAYS,
  // 20 results a page; three pages covers what Text Search usually returns.
  maxPages: 3,
  requestCost,
  async search(q): Promise<ProviderResult<{ companies: DiscoveredCompany[]; nextPageToken: string | null }>> {
    const cost = requestCost().millicents;
    const r = await post(searchBody(q), FIELDS);
    if (!r.ok) {
      // Google bills only successful requests.
      return { status: 'ERROR', costMillicents: 0, error: errorMessage(r), raw: r.text };
    }
    const parsed = responseSchema.safeParse(r.json ?? {});
    if (!parsed.success) return { status: 'ERROR', costMillicents: cost, error: 'Unexpected response shape from Google Places', raw: r.text };
    const companies = (parsed.data.places ?? []).map(toCompany).filter((c): c is DiscoveredCompany => !!c);
    return {
      status: companies.length ? 'SUCCESS' : 'NOT_FOUND',
      data: { companies, nextPageToken: parsed.data.nextPageToken ?? null },
      costMillicents: cost,
      // Raw Places content is not kept in the provider log: it is subject to
      // the same storage limits as the fields themselves.
      raw: { results: companies.length, nextPage: !!parsed.data.nextPageToken },
    };
  },
};

export const googlePlacesConnector: ConnectorDefinition = {
  id: 'google_places',
  name: 'Google Places',
  capabilities: ['COMPANY_DISCOVERY'],
  description: "Finds local businesses by category and area (e.g. machine shops in Mississauga). Only the place id is kept; account details come from each business's own website, read in the same run.",
  requiredEnv: ['GOOGLE_PLACES_API_KEY'],
  implemented: true,
  docsUrl: 'https://developers.google.com/maps/documentation/places/web-service/text-search',
  defaultPriority: 10,
  discovery,
  async healthCheck() {
    try {
      // Ids only: the cheapest Text Search tier.
      const r = await post({ textQuery: 'library in Toronto, ON', pageSize: 1, regionCode: 'CA' }, 'places.id');
      if (r.ok) return { ok: true, detail: 'API key accepted (Places API (New) enabled)' };
      return { ok: false, detail: errorMessage(r) };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'Request failed' };
    }
  },
};
