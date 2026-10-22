import * as cheerio from 'cheerio';
import { fetchPage, isAllowed } from '@/server/services/crawler';
import { nameSimilarity, normalizeCompanyName, socialNetworkOf } from '@/server/services/companies/normalize';

/**
 * What a business says about itself on its own website: its name, main
 * phone, address and social profiles, from structured data (schema.org
 * JSON-LD), meta tags and tel: links. This is the first-party record an
 * account is built from when a business was found through a source whose
 * content may not be stored (Google Places).
 *
 * Page content is untrusted input: it is only parsed for these fields,
 * length-limited, and never passed to a model or rendered as HTML.
 */

export interface SiteAddress {
  street: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface SiteIdentity {
  url: string;
  /** Candidate names, strongest evidence first. */
  names: string[];
  phone: string | null;
  address: SiteAddress | null;
  socialProfiles: Record<string, string>;
  description: string | null;
  /** Lower-cased visible text, for confirming a name appears on the site. */
  text: string;
}

const clean = (v: unknown, max = 200) => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s && s.length <= max ? s : null;
};

const GENERIC = new Set(['home', 'homepage', 'welcome', 'contact', 'contact us', 'about', 'about us', 'index', 'untitled', 'site', 'website']);

function jsonLdObjects($: cheerio.CheerioAPI): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 4) return;
    if (Array.isArray(node)) { node.forEach((n) => visit(n, depth + 1)); return; }
    const obj = node as Record<string, unknown>;
    out.push(obj);
    if (obj['@graph']) visit(obj['@graph'], depth + 1);
  };
  $('script[type="application/ld+json"]').slice(0, 10).each((_, el) => {
    const raw = $(el).contents().text().slice(0, 100_000);
    try { visit(JSON.parse(raw), 0); } catch { /* malformed JSON-LD is common */ }
  });
  return out;
}

function types(obj: Record<string, unknown>): string[] {
  const t = obj['@type'];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === 'string');
}

/** Organization, LocalBusiness and their many subtypes (Dentist, Store, …). */
function isBusiness(obj: Record<string, unknown>) {
  const ts = types(obj);
  if (!ts.length) return false;
  if (ts.some((t) => /^(WebSite|WebPage|BreadcrumbList|ImageObject|Person|Product|Offer|Review|FAQPage|Article|BlogPosting|SiteNavigationElement|SearchAction|ListItem|Event|VideoObject)$/.test(t))) return false;
  return ts.some((t) => /Organization|Business|Corporation|Store|Service|Restaurant|Clinic|Dentist|Physician|Office|Agency|Contractor|Company|Shop|Center|Practice|Plumber|Electrician|Locksmith|Attorney|Notary|Hotel|Gym/i.test(t))
    || 'address' in obj || 'telephone' in obj;
}

function addressOf(value: unknown): SiteAddress | null {
  const a = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | string | undefined;
  if (!a) return null;
  if (typeof a === 'string') return null; // free-text addresses are too ambiguous to split
  const country = a.addressCountry;
  const result: SiteAddress = {
    street: clean(a.streetAddress, 200),
    city: clean(a.addressLocality, 80),
    region: clean(a.addressRegion, 80),
    postalCode: clean(a.postalCode, 20),
    country: clean(typeof country === 'object' && country ? (country as Record<string, unknown>).name : country, 80),
  };
  return Object.values(result).some(Boolean) ? result : null;
}

function phoneOf(raw: string | null | undefined) {
  if (!raw) return null;
  const s = decodeURIComponent(raw.replace(/^tel:/i, '')).replace(/[^\d+()\-.\s x]/gi, '').trim();
  const digits = s.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 ? s.slice(0, 40) : null;
}

function socialOf($: cheerio.CheerioAPI) {
  const found: Record<string, string> = {};
  $('a[href]').slice(0, 400).each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (!/^https?:\/\//i.test(href) || /sharer|share\?|\/intent\/|\/dialog\//i.test(href) || href.length > 300) return;
    const network = socialNetworkOf(href);
    if (network && !found[network]) {
      try {
        const u = new URL(href);
        if (u.pathname.replace(/\/+$/, '').length > 1) found[network] = `${u.origin}${u.pathname}`;
      } catch { /* ignore */ }
    }
  });
  return found;
}

/** Parses one page. Pure: no network. */
export function parseSiteIdentity(html: string, url: string): SiteIdentity {
  const $ = cheerio.load(html);
  const ld = jsonLdObjects($).filter(isBusiness);
  const names: string[] = [];
  const push = (v: unknown) => {
    const n = clean(v, 120);
    if (n && n.length >= 2 && !GENERIC.has(n.toLowerCase()) && !names.includes(n)) names.push(n);
  };
  for (const o of ld) { push(o.legalName); push(o.name); }
  push($('meta[property="og:site_name"]').attr('content'));
  const title = clean($('title').first().text(), 300);
  if (title) title.split(/\s+[|–—:•·]\s+|\s+-\s+/).forEach(push);
  push($('h1').first().text());

  let phone: string | null = null;
  for (const o of ld) phone ??= phoneOf(typeof o.telephone === 'string' ? o.telephone : null);
  phone ??= phoneOf($('a[href^="tel:"]').first().attr('href'));

  let address: SiteAddress | null = null;
  for (const o of ld) address ??= addressOf(o.address);

  const description = clean($('meta[name="description"]').attr('content'), 500)
    ?? clean($('meta[property="og:description"]').attr('content'), 500);

  $('script, style, noscript, svg').remove();
  const text = $('body').text().replace(/\s+/g, ' ').toLowerCase().slice(0, 50_000);
  return { url, names, phone, address, socialProfiles: socialOf($), description, text };
}

/**
 * The business name to record, taken from the site itself. `hint` is the
 * name the discovery source used; it is only compared against, never stored.
 * Returns null when the site doesn't confirm a name close to the hint —
 * usually a listing pointing at the wrong website, or a parent brand's site.
 */
export function confirmName(identity: SiteIdentity, hint: string): { name: string; similarity: number } | null {
  const target = normalizeCompanyName(hint);
  let best: { name: string; similarity: number } | null = null;
  for (const name of identity.names) {
    const similarity = nameSimilarity(normalizeCompanyName(name), target);
    if (!best || similarity > best.similarity) best = { name, similarity };
  }
  if (best && best.similarity >= 0.85) return best;
  // The listed name written out on the page, as the page writes it.
  const lower = hint.trim().toLowerCase();
  const at = lower.length >= 3 ? identity.text.indexOf(lower) : -1;
  if (at >= 0) {
    const candidate = identity.names.find((n) => n.toLowerCase() === lower);
    return { name: candidate ?? hint.trim(), similarity: 1 };
  }
  return null;
}

/** Fetches the homepage (robots.txt respected) and reads its identity. */
export async function readSiteIdentity(websiteUrl: string): Promise<{ identity: SiteIdentity | null; reason: string | null }> {
  let origin: string;
  let path: string;
  try {
    const u = new URL(/^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`);
    origin = u.origin;
    path = u.pathname || '/';
  } catch {
    return { identity: null, reason: 'Website address is not valid' };
  }
  if (!(await isAllowed(origin, path))) return { identity: null, reason: "The website's robots.txt asks automated visitors not to read it" };
  const page = await fetchPage(origin + path);
  if (!page) return { identity: null, reason: 'Website could not be reached' };
  return { identity: parseSiteIdentity(page.html, page.finalUrl), reason: null };
}
