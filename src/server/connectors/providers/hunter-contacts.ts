import { z } from 'zod';
import type { ContactCandidate, ContactProvider, EmailFinderProvider, ProviderResult } from '../types';

const email = z.string().email().max(254);
const text = z.string().nullish();
const person = z.object({ value: email, first_name: text, last_name: text, position: text, department: text, phone_number: text, linkedin: text,
  verification: z.object({ status: text }).nullish(), sources: z.array(z.object({ uri: z.string().url() })).optional() });
const cost = () => {
  const value = Number(process.env.HUNTER_COST_PER_SEARCH_MILLICENTS ?? 1000);
  return Number.isFinite(value) && value >= 0 ? value : 1000;
};
async function request(path: string, params: Record<string, string>, fetchImpl: typeof fetch) {
  const key = process.env.HUNTER_API_KEY;
  if (!key?.trim()) throw new Error('HUNTER_API_KEY is not configured');
  const url = new URL(`https://api.hunter.io/v2/${path}`);
  url.search = new URLSearchParams({ ...params, api_key: key }).toString();
  const res = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  // Never return the request URL or a provider error body that may echo the key.
  if (!res.ok) throw new Error(`Hunter ${path} responded ${res.status}; check key, endpoint access and credits`);
  return res.json();
}

export function hunterContacts(fetchImpl: typeof fetch = fetch): ContactProvider {
  return { async findContacts({ domain, limit }): Promise<ProviderResult<ContactCandidate[]>> {
    const raw = await request('domain-search', { domain, limit: String(Math.min(10, Math.max(1, limit))) }, fetchImpl);
    const parsed = z.object({ data: z.object({ emails: z.array(person) }) }).safeParse(raw);
    if (!parsed.success) return { status: 'ERROR', costMillicents: cost(), error: 'Unexpected Hunter domain-search response' };
    const data = parsed.data.data.emails.map((p): ContactCandidate => ({
      externalId: null, firstName: p.first_name ?? null, lastName: p.last_name ?? null, title: p.position ?? null,
      seniority: null, department: p.department ?? null, email: p.value.toLowerCase(),
      // Search's historic verification is not a new verification. Check it before sending.
      emailVerification: 'UNVERIFIED', phone: p.phone_number ?? null, directPhone: null, mobilePhone: null,
      linkedinUrl: p.linkedin ?? null, city: null, region: null, country: null, sourceUrl: p.sources?.[0]?.uri ?? null,
    }));
    return { status: data.length ? 'SUCCESS' : 'NOT_FOUND', data, costMillicents: cost(), raw: { returned: data.length } };
  } };
}

export function hunterEmailFinder(fetchImpl: typeof fetch = fetch): EmailFinderProvider {
  return { async findEmail({ firstName, lastName, domain }) {
    if (!firstName || !lastName) return { status: 'NOT_FOUND', costMillicents: 0 };
    const raw = await request('email-finder', { domain, first_name: firstName, last_name: lastName }, fetchImpl);
    const parsed = z.object({ data: z.object({ email: email.nullable() }).nullable() }).safeParse(raw);
    if (!parsed.success) return { status: 'ERROR', costMillicents: cost(), error: 'Unexpected Hunter email-finder response' };
    const found = parsed.data.data?.email;
    return found ? { status: 'SUCCESS', data: { email: found.toLowerCase(), verification: 'UNVERIFIED' }, costMillicents: cost() }
      : { status: 'NOT_FOUND', costMillicents: 0 };
  } };
}
