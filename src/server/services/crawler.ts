import * as cheerio from 'cheerio';
import { safeFetch } from './net-guard';
import { extractWebsiteContacts, type WebsiteContact } from './website-contacts';

export const CRAWLER_USER_AGENT = 'RelayBot/1.0 (research for a single named prospect)';

export interface CrawledPage {
  /** Stable short id (p1, p2…) used as the citation key in prompts. */
  id: string;
  url: string;
  title: string;
  text: string;
  chars: number;
  fetchedAt: string;
}

export interface CrawlResult {
  pages: CrawledPage[];
  contacts?: WebsiteContact[];
  coverage?: { visited: number; discovered: number; limit: number; truncated: boolean; contactPageFound: boolean };
  detectedSoftware: string[];
  signals: Record<string, boolean>;
  blockedByRobots: boolean;
  errors: Array<{ url: string; reason: string }>;
}

const USER_AGENT = CRAWLER_USER_AGENT;
const MAX_PAGES = 16;
const MAX_CHARS_PER_PAGE = 12_000;
const FETCH_TIMEOUT_MS = 12_000;
const POLITE_DELAY_MS = 900;

/**
 * Pages ranked by how much they tell you about how a business actually
 * operates. The homepage sells; the services and careers pages describe the
 * work. A job posting for "someone to handle scheduling and invoicing" is the
 * single most useful artifact on most small-business sites.
 */
const PRIORITY_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\/(services|what-we-do|solutions|capabilities)/i, weight: 10 },
  { pattern: /\/(about|our-story|team|who-we-are)/i, weight: 8 },
  { pattern: /\/(careers|jobs|hiring|join-us)/i, weight: 9 },
  { pattern: /\/(process|how-it-works|approach)/i, weight: 7 },
  { pattern: /\/(contact|locations|book|schedule|appointment)/i, weight: 12 },
  { pattern: /\/(pricing|rates|plans)/i, weight: 5 },
  { pattern: /\/(faq|resources)/i, weight: 3 },
];

/** Fingerprints for software visible in page source. Presence is evidence. */
const TECH_FINGERPRINTS: Array<{ name: string; test: RegExp }> = [
  { name: 'WordPress', test: /wp-content|wp-includes/i },
  { name: 'Shopify', test: /cdn\.shopify\.com|shopify\.js/i },
  { name: 'Squarespace', test: /squarespace|sqsp\.net/i },
  { name: 'Wix', test: /wix\.com|wixstatic/i },
  { name: 'HubSpot', test: /hs-scripts\.com|hubspot/i },
  { name: 'Salesforce', test: /force\.com|salesforce/i },
  { name: 'Calendly', test: /calendly\.com/i },
  { name: 'Cal.com', test: /cal\.com\/embed/i },
  { name: 'Jobber', test: /getjobber\.com/i },
  { name: 'ServiceTitan', test: /servicetitan/i },
  { name: 'Housecall Pro', test: /housecallpro/i },
  { name: 'QuickBooks', test: /quickbooks|intuit\.com/i },
  { name: 'Xero', test: /xero\.com/i },
  { name: 'Microsoft 365', test: /sharepoint\.com|office365|outlook\.office/i },
  { name: 'Google Workspace', test: /docs\.google\.com|forms\.gle/i },
  { name: 'Mailchimp', test: /mailchimp|list-manage\.com/i },
  { name: 'Zendesk', test: /zendesk/i },
  { name: 'Intercom', test: /intercom\.io/i },
  { name: 'Dentrix', test: /dentrix/i },
  { name: 'Open Dental', test: /opendental/i },
  { name: 'Clio', test: /clio\.com/i },
];

/**
 * Operational signals — the absence of something is often the opportunity.
 * "No online booking, phone number in the header, contact form only" describes
 * a practice whose front desk is the bottleneck.
 */
function detectSignals(html: string, $: cheerio.CheerioAPI) {
  const text = $('body').text();
  return {
    hasOnlineBooking: /book (now|online|an appointment)|schedule (online|now)|request appointment/i.test(text)
      || /calendly|acuityscheduling|squareup\.com\/appointments/i.test(html),
    hasContactFormOnly: $('form').length > 0 && !/calendly|acuity/i.test(html),
    hasCareersPage: /careers|we're hiring|now hiring|join our team/i.test(text),
    hasClientPortal: /client portal|customer portal|patient portal|log ?in to your account/i.test(text),
    hasLiveChat: /intercom|drift\.com|tawk\.to|livechat/i.test(html),
    mentionsPaperwork: /paperwork|fill out (the |a )?form|print and (sign|bring)|fax/i.test(text),
    mentionsPhoneFirst: /call (us|today|now)|give us a call/i.test(text),
    hasQuoteRequest: /request a (quote|estimate)|free estimate/i.test(text),
  };
}

async function boundedText(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('Response exceeds page size limit');
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = ''; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new Error('Response exceeds page size limit'); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function fetchPage(url: string): Promise<{ html: string; finalUrl: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // Prospect URLs come from outside; safeFetch refuses private networks
    // and checks every redirect hop.
    const res = await safeFetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html')) return null;
    // Guard against a 50MB page taking down the worker.
    const body = await boundedText(res, 800_000);
    return { html: body, finalUrl: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Most specific matching group and rule wins; Allow wins equal-length ties. */
export function robotsAllowed(txt: string, path: string): boolean {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let group = { agents: [] as string[], rules: [] as Array<{ allow: boolean; path: string }> };
  let rulesStarted = false;
  for (const raw of txt.split('\n')) {
    const line = raw.split('#')[0]!.trim();
    const at = line.indexOf(':');
    if (at < 0) continue;
    const key = line.slice(0, at).trim().toLowerCase();
    const value = line.slice(at + 1).trim();
    if (key === 'user-agent') {
      if (rulesStarted) { groups.push(group); group = { agents: [], rules: [] }; rulesStarted = false; }
      group.agents.push(value.toLowerCase());
    } else if ((key === 'allow' || key === 'disallow') && group.agents.length) {
      rulesStarted = true;
      if (value) group.rules.push({ allow: key === 'allow', path: value });
    }
  }
  groups.push(group);
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && 'relaybot'.includes(a)));
  const applicable = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  const matching = applicable.flatMap((g) => g.rules).filter((r) => {
    const anchor = r.path.endsWith('$');
    const pattern = anchor ? r.path.slice(0, -1) : r.path;
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp('^' + escaped + (anchor ? '$' : '')).test(path);
  }).sort((a, b) => b.path.replace(/[*$]/g, '').length - a.path.replace(/[*$]/g, '').length || Number(b.allow) - Number(a.allow));
  return matching[0]?.allow ?? true;
}

async function readRobots(origin: string): Promise<string> {
  const res = await safeFetch(`${origin}/robots.txt`, {
    headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(6000),
  });
  if (res.status === 404 || res.status === 410) return '';
  if (!res.ok) throw new Error(`robots.txt unavailable (${res.status})`);
  return boundedText(res, 500_000);
}

export async function isAllowed(origin: string, path: string): Promise<boolean> {
  try { return robotsAllowed(await readRobots(origin), path); } catch { return false; }
}

function extractText($: cheerio.CheerioAPI): string {
  $('script, style, noscript, svg, iframe, nav, footer, header').remove();
  return $('body').text().replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS_PER_PAGE);
}

/**
 * Crawls a prospect's site. Deliberately small and slow: eight pages, one
 * request per second, robots.txt respected. This is research on one named
 * company, not a scraper — behaving like one keeps the sending domain clean and
 * the agency out of trouble.
 */
export async function crawlSite(websiteUrl: string, opts: { maxPages?: number } = {}): Promise<CrawlResult> {
  const maxPages = Math.min(opts.maxPages ?? MAX_PAGES, MAX_PAGES);
  const result: CrawlResult = { pages: [], contacts: [], detectedSoftware: [], signals: {}, blockedByRobots: false, errors: [] };
  let start: URL;
  try { start = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`); }
  catch { result.errors.push({ url: websiteUrl, reason: 'Not a valid URL' }); return result; }
  const robots = new Map<string, string>();
  const allowed = async (url: URL) => {
    if (!robots.has(url.origin)) robots.set(url.origin, await readRobots(url.origin));
    return robotsAllowed(robots.get(url.origin)!, url.pathname + url.search);
  };
  const queue = new Map<string, { weight: number; depth: number }>([[start.href, { weight: 100, depth: 0 }]]);
  const visited = new Set<string>();
  const software = new Set<string>();
  const host = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, '');
  let contactPageFound = false;
  while (queue.size && visited.size < maxPages) {
    const [url, item] = [...queue.entries()].sort((a, b) => b[1].weight - a[1].weight)[0]!;
    queue.delete(url); visited.add(url);
    let permitted = false;
    try { permitted = await allowed(new URL(url)); }
    catch { result.errors.push({ url, reason: 'Could not check robots.txt; page held for review' }); continue; }
    if (!permitted) {
      if (result.pages.length === 0 && item.depth === 0) result.blockedByRobots = true;
      result.errors.push({ url, reason: 'Disallowed by robots.txt' }); continue;
    }
    if (visited.size > 1) await new Promise((r) => setTimeout(r, POLITE_DELAY_MS));
    const page = await fetchPage(url);
    if (!page) { result.errors.push({ url, reason: 'Fetch failed' }); continue; }
    const final = new URL(page.finalUrl);
    if (host(final) !== host(start)) { result.errors.push({ url, reason: 'Redirected outside the company website' }); continue; }
    // A redirect may change the host (www) or the path; honour its robots rules too.
    try {
      if (final.href !== url && !(await allowed(final))) { result.errors.push({ url: final.href, reason: 'Redirect target disallowed by robots.txt' }); continue; }
    } catch { result.errors.push({ url: final.href, reason: 'Could not check redirect robots.txt' }); continue; }
    const $ = cheerio.load(page.html);
    const title = $('title').first().text().trim() || final.pathname;
    const found = extractWebsiteContacts(page.html, final.href);
    result.contacts!.push(...found);
    contactPageFound ||= /contact|locations/i.test(final.pathname) || found.length > 0;
    for (const fp of TECH_FINGERPRINTS) if (fp.test.test(page.html)) software.add(fp.name);
    for (const [key, value] of Object.entries(detectSignals(page.html, $))) result.signals[key] ||= value;
    // Collect links BEFORE extractText removes nav/header/footer. Contact links
    // commonly live only there; removing them used to lose the entire route.
    if (item.depth < 3) $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) return;
      let next: URL;
      try { next = new URL(href, final); } catch { return; }
      if (next.origin !== final.origin || !['http:', 'https:'].includes(next.protocol)) return;
      if (/\.(pdf|jpe?g|png|gif|svg|zip|docx?|xlsx?)$/i.test(next.pathname)) return;
      next.search = ''; next.hash = ''; next.pathname = next.pathname.replace(/\/$/, '') || '/';
      if (visited.has(next.href) || queue.has(next.href) || queue.size >= 200) return;
      const match = PRIORITY_PATTERNS.find((p) => p.pattern.test(next.pathname));
      if (match) queue.set(next.href, { weight: match.weight, depth: item.depth + 1 });
    });
    const text = extractText($);
    // Short contact pages still contain useful, citable details.
    if (text || found.length) result.pages.push({ id: `p${result.pages.length + 1}`, url: final.href, title, text, chars: text.length, fetchedAt: new Date().toISOString() });
  }
  result.detectedSoftware = [...software];
  result.contacts = [...new Map(result.contacts!.map((c) => [`${c.kind}:${c.value}`, c])).values()];
  result.coverage = { visited: visited.size, discovered: visited.size + queue.size, limit: maxPages, truncated: queue.size > 0, contactPageFound };
  return result;
}
