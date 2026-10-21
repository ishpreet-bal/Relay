import { z } from 'zod';
import type { EmailVerification, Seniority } from '@prisma/client';
import type {
  CompanyProfile, ConnectorDefinition, ContactCandidate, ContactProvider, CompanyProvider, DiscoveredCompany, DiscoveryPage,
  DiscoveryProvider, EmailFinderProvider, ProviderResult,
} from '../types';
import { toDomain } from '@/lib/utils';

/**
 * Apollo.io adapter: company enrichment, people search, and email lookup.
 *
 * Built against Apollo's public REST API (api.apollo.io/api/v1). Responses are
 * parsed permissively — fields Apollo omits or renames degrade to null rather
 * than failing — and every call is recorded with its raw response, so a shape
 * change shows up in the provider log instead of corrupting records. Run the
 * connector's health check before relying on it.
 *
 * People search does not reveal emails; a reveal is a separate, credit-
 * consuming call made only for contacts Relay decides to pursue.
 */

const BASE = 'https://api.apollo.io';

function apiKey() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY is not configured');
  return key;
}

/** Your plan's cost per Apollo credit, for unit economics. 0 when unknown. */
function creditMillicents() {
  const v = Number(process.env.APOLLO_COST_PER_CREDIT_MILLICENTS ?? 0);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

async function call(path: string, init: { method: 'GET' | 'POST'; query?: Record<string, string>; body?: unknown }) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: init.method,
    headers: { 'x-api-key': apiKey(), 'content-type': 'application/json', 'cache-control': 'no-cache', accept: 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  return { ok: res.ok, status: res.status, json, text: text.slice(0, 500) };
}

const str = z.string().nullish().transform((v) => v ?? null);
const num = z.number().nullish().transform((v) => v ?? null);

const organizationSchema = z.object({
  id: str,
  name: str,
  website_url: str,
  primary_domain: str,
  linkedin_url: str,
  phone: str,
  primary_phone: z.object({ number: str, sanitized_number: str }).partial().nullish(),
  industry: str,
  estimated_num_employees: num,
  annual_revenue_printed: str,
  short_description: str,
  founded_year: num,
  city: str,
  state: str,
  country: str,
  keywords: z.array(z.string()).nullish(),
  technology_names: z.array(z.string()).nullish(),
}).passthrough();

const personSchema = z.object({
  id: str,
  first_name: str,
  last_name: str,
  title: str,
  seniority: str,
  departments: z.array(z.string()).nullish(),
  email: str,
  email_status: str,
  linkedin_url: str,
  city: str,
  state: str,
  country: str,
}).passthrough();

const SENIORITY: Record<string, Seniority> = {
  owner: 'OWNER', founder: 'OWNER', c_suite: 'C_LEVEL', partner: 'C_LEVEL', vp: 'VP',
  head: 'DIRECTOR', director: 'DIRECTOR', manager: 'MANAGER', senior: 'SENIOR', entry: 'ENTRY', intern: 'ENTRY',
};

const TO_APOLLO_SENIORITY: Record<Seniority, string[]> = {
  OWNER: ['owner', 'founder'], C_LEVEL: ['c_suite'], VP: ['vp'], DIRECTOR: ['director', 'head'],
  MANAGER: ['manager'], SENIOR: ['senior'], ENTRY: ['entry'], UNKNOWN: [],
};

function emailStatus(s: string | null): EmailVerification | null {
  switch ((s ?? '').toLowerCase()) {
    case 'verified': return 'VALID';
    case 'likely to engage':
    case 'guessed': return 'RISKY';
    case 'unverified': return 'UNVERIFIED';
    case 'bounced':
    case 'invalid': return 'INVALID';
    default: return null;
  }
}

function errorResult<T>(r: { status: number; text: string }): ProviderResult<T> {
  return { status: 'ERROR', costMillicents: 0, error: `Apollo responded ${r.status}: ${r.text}`, raw: r.text };
}

// Organization search results: the same fields, more of them optional.
const searchOrgSchema = organizationSchema.extend({
  id: z.string(),
  street_address: str,
  postal_code: str,
  raw_address: str,
}).passthrough();

/** Credits one search page costs on your plan (Apollo bills search pages on most API plans). */
function searchCreditsPerPage() {
  const v = Number(process.env.APOLLO_SEARCH_CREDITS_PER_PAGE ?? 1);
  return Number.isFinite(v) && v >= 0 ? v : 1;
}

export function employeeRange(min: number | null, max: number | null): string[] {
  if (min === null && max === null) return [];
  return [`${Math.max(1, min ?? 1)},${max ?? 1_000_000}`];
}

export function toDiscovered(o: z.infer<typeof searchOrgSchema>): DiscoveredCompany | null {
  if (!o.name) return null;
  return {
    externalId: o.id,
    name: o.name,
    websiteUrl: o.website_url ?? (o.primary_domain ? `https://${o.primary_domain}` : null),
    phone: o.primary_phone?.number ?? o.phone ?? null,
    addressLine: o.street_address,
    city: o.city,
    region: o.state,
    postalCode: o.postal_code,
    country: o.country,
    latitude: null,
    longitude: null,
    industry: o.industry,
    categories: (o.keywords ?? []).slice(0, 10),
    employeeCount: o.estimated_num_employees,
    linkedinUrl: o.linkedin_url,
    description: o.short_description,
    foundedYear: o.founded_year,
    businessStatus: null,
    sourceUrl: null,
  };
}

const discovery: DiscoveryProvider = {
  source: 'APOLLO',
  queryStyle: 'structured',
  // Storage of Apollo data is governed by your Apollo subscription terms.
  storage: 'licensed',
  coordinateRetentionDays: null,
  maxPages: 5,
  requestCost: () => ({ millicents: creditMillicents() * searchCreditsPerPage(), isEstimate: true }),
  async search(q): Promise<ProviderResult<DiscoveryPage>> {
    const page = q.pageToken ? Number(q.pageToken) : 1;
    const r = await call('/api/v1/mixed_companies/search', {
      method: 'POST',
      body: {
        ...(q.locations.length ? { organization_locations: q.locations } : {}),
        ...(q.keywords.length ? { q_organization_keyword_tags: q.keywords } : {}),
        ...(employeeRange(q.employeeMin, q.employeeMax).length ? { organization_num_employees_ranges: employeeRange(q.employeeMin, q.employeeMax) } : {}),
        page,
        per_page: Math.min(100, Math.max(1, q.pageSize)),
      },
    });
    if (!r.ok) return errorResult(r);
    const body = r.json as { organizations?: unknown[]; accounts?: unknown[]; pagination?: { page?: number; total_pages?: number } } | null;
    const rows = [...(body?.organizations ?? []), ...(body?.accounts ?? [])];
    const companies = rows
      .map((row) => searchOrgSchema.safeParse(row))
      .filter((p) => p.success)
      .map((p) => toDiscovered(p.data!))
      .filter((c): c is DiscoveredCompany => !!c);
    const totalPages = body?.pagination?.total_pages ?? page;
    const cost = creditMillicents() * searchCreditsPerPage();
    return {
      status: companies.length ? 'SUCCESS' : 'NOT_FOUND',
      data: { companies, nextPageToken: page < totalPages ? String(page + 1) : null },
      costMillicents: cost,
      raw: { results: companies.length, page, totalPages },
    };
  },
};

const company: CompanyProvider = {
  async enrichCompany({ domain }) {
    const r = await call('/api/v1/organizations/enrich', { method: 'GET', query: { domain } });
    if (r.status === 404) return { status: 'NOT_FOUND', costMillicents: 0, raw: r.json };
    if (!r.ok) return errorResult(r);
    const parsed = organizationSchema.safeParse((r.json as { organization?: unknown })?.organization);
    if (!parsed.success || !parsed.data.name) return { status: 'NOT_FOUND', costMillicents: creditMillicents(), raw: r.json };
    const o = parsed.data;
    const data: CompanyProfile = {
      name: o.name,
      domain: o.primary_domain ?? toDomain(o.website_url),
      websiteUrl: o.website_url,
      linkedinUrl: o.linkedin_url,
      phone: o.primary_phone?.number ?? o.phone ?? null,
      industry: o.industry,
      employeeCount: o.estimated_num_employees,
      employeeRange: null,
      revenueRange: o.annual_revenue_printed,
      description: o.short_description,
      foundedYear: o.founded_year,
      city: o.city,
      region: o.state,
      country: o.country,
      keywords: (o.keywords ?? []).slice(0, 30),
      techStack: (o.technology_names ?? []).slice(0, 40),
    };
    return { status: 'SUCCESS', data, externalId: o.id, confidence: 0.85, costMillicents: creditMillicents(), raw: r.json };
  },
};

const contacts: ContactProvider = {
  async findContacts({ domain, titles, seniorities, limit }) {
    const r = await call('/api/v1/mixed_people/api_search', {
      method: 'POST',
      body: {
        q_organization_domains_list: [domain],
        ...(titles.length ? { person_titles: titles } : {}),
        ...(seniorities.length ? { person_seniorities: seniorities.flatMap((s) => TO_APOLLO_SENIORITY[s]) } : {}),
        per_page: Math.min(25, Math.max(1, limit)),
        page: 1,
      },
    });
    if (!r.ok) return errorResult(r);
    const people = z.array(personSchema).safeParse((r.json as { people?: unknown })?.people ?? []);
    if (!people.success) return { status: 'ERROR', costMillicents: 0, error: 'Unexpected response shape from Apollo people search', raw: r.json };
    if (!people.data.length) return { status: 'NOT_FOUND', costMillicents: 0, raw: r.json };

    const data: ContactCandidate[] = people.data.map((p) => ({
      externalId: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      title: p.title,
      seniority: p.seniority ? SENIORITY[p.seniority.toLowerCase()] ?? null : null,
      department: p.departments?.[0]?.replace(/^master_/, '').replace(/_/g, ' ') ?? null,
      email: p.email && !p.email.includes('email_not_unlocked') ? p.email : null,
      emailVerification: emailStatus(p.email_status),
      phone: null,
      directPhone: null,
      mobilePhone: null,
      linkedinUrl: p.linkedin_url,
      city: p.city,
      region: p.state,
      country: p.country,
    }));
    // Search does not consume credits on Apollo's API plans.
    return { status: 'SUCCESS', data, confidence: 0.8, costMillicents: 0, raw: { total: data.length } };
  },
};

const emailFinder: EmailFinderProvider = {
  async findEmail({ firstName, lastName, domain, externalId }) {
    const r = await call('/api/v1/people/match', {
      method: 'POST',
      body: externalId
        ? { id: externalId, reveal_personal_emails: false }
        : { first_name: firstName, last_name: lastName, domain, reveal_personal_emails: false },
    });
    if (!r.ok) return errorResult(r);
    const person = personSchema.safeParse((r.json as { person?: unknown })?.person);
    if (!person.success || !person.data.email) return { status: 'NOT_FOUND', costMillicents: creditMillicents(), raw: r.json };
    return {
      status: 'SUCCESS',
      data: { email: person.data.email.toLowerCase(), verification: emailStatus(person.data.email_status) ?? 'UNVERIFIED' },
      externalId: person.data.id,
      confidence: person.data.email_status === 'verified' ? 0.95 : 0.6,
      costMillicents: creditMillicents(),
      raw: r.json,
    };
  },
};

export const apolloConnector: ConnectorDefinition = {
  id: 'apollo',
  name: 'Apollo',
  capabilities: ['COMPANY_DISCOVERY', 'COMPANY_DATA', 'CONTACT_DATA', 'EMAIL_FINDER'],
  description: 'Company search by industry, location and size; company firmographics; people search by title and seniority; work email lookup.',
  requiredEnv: ['APOLLO_API_KEY'],
  implemented: true,
  docsUrl: 'https://docs.apollo.io/reference',
  defaultPriority: 20,
  discovery,
  company,
  contacts,
  emailFinder,
  async healthCheck() {
    try {
      const r = await call('/v1/auth/health', { method: 'GET' });
      const healthy = (r.json as { healthy?: boolean; is_logged_in?: boolean } | null);
      if (r.ok && healthy?.is_logged_in) return { ok: true, detail: 'API key accepted' };
      return { ok: false, detail: `Apollo responded ${r.status}${healthy ? '' : `: ${r.text}`}` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'Request failed' };
    }
  },
};
