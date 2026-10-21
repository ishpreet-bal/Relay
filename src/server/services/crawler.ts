import * as cheerio from 'cheerio';
import { safeFetch } from './net-guard';

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
  detectedSoftware: string[];
  signals: Record<string, boolean>;
  blockedByRobots: boolean;
  errors: Array<{ url: string; reason: string }>;
}

const USER_AGENT = CRAWLER_USER_AGENT;
const MAX_PAGES = 8;
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
  { pattern: /\/(contact|locations|book|schedule|appointment)/i, weight: 6 },
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
    const body = await res.text();
    return { html: body.slice(0, 800_000), finalUrl: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Minimal robots.txt check for our user-agent and the wildcard group. */
export async function isAllowed(origin: string, path: string): Promise<boolean> {
  try {
    const res = await safeFetch(`${origin}/robots.txt`, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return true;
    const txt = await res.text();

    let applies = false;
    const disallowed: string[] = [];
    for (const raw of txt.split('\n')) {
      const line = raw.split('#')[0]!.trim();
      const [rawKey, ...rest] = line.split(':');
      const key = rawKey?.toLowerCase().trim();
      const value = rest.join(':').trim();
      if (key === 'user-agent') applies = value === '*' || /relaybot/i.test(value);
      else if (key === 'disallow' && applies && value) disallowed.push(value);
    }
    return !disallowed.some((rule) => rule === '/' || path.startsWith(rule));
  } catch {
    return true;
  }
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
export async function crawlSite(websiteUrl: string): Promise<CrawlResult> {
  const result: CrawlResult = {
    pages: [], detectedSoftware: [], signals: {}, blockedByRobots: false, errors: [],
  };

  let origin: string;
  let startPath: string;
  try {
    const parsed = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
    origin = parsed.origin;
    startPath = parsed.pathname;
  } catch {
    result.errors.push({ url: websiteUrl, reason: 'Not a valid URL' });
    return result;
  }

  if (!(await isAllowed(origin, startPath))) {
    result.blockedByRobots = true;
    result.errors.push({ url: origin, reason: 'Disallowed by robots.txt' });
    return result;
  }

  const home = await fetchPage(origin + startPath);
  if (!home) {
    result.errors.push({ url: origin, reason: 'Homepage unreachable' });
    return result;
  }

  const $home = cheerio.load(home.html);
  const software = new Set<string>();
  for (const fp of TECH_FINGERPRINTS) if (fp.test.test(home.html)) software.add(fp.name);
  result.signals = detectSignals(home.html, $home);

  result.pages.push({
    id: 'p1',
    url: home.finalUrl,
    title: $home('title').first().text().trim() || 'Homepage',
    text: extractText($home),
    chars: 0,
    fetchedAt: new Date().toISOString(),
  });

  // Rank internal links, dedupe by path, take the top MAX_PAGES - 1.
  const candidates = new Map<string, number>();
  $home('a[href]').each((_, el) => {
    const href = $home(el).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    let abs: URL;
    try { abs = new URL(href, home.finalUrl); } catch { return; }
    if (abs.origin !== origin) return;
    if (/\.(pdf|jpe?g|png|gif|svg|zip|docx?|xlsx?)$/i.test(abs.pathname)) return;

    const path = abs.pathname.replace(/\/$/, '') || '/';
    if (path === '/' || candidates.has(path)) return;

    const match = PRIORITY_PATTERNS.find((p) => p.pattern.test(path));
    if (match) candidates.set(path, match.weight);
  });

  const ranked = [...candidates.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_PAGES - 1);

  for (const [path] of ranked) {
    await new Promise((r) => setTimeout(r, POLITE_DELAY_MS));
    if (!(await isAllowed(origin, path))) continue;

    const page = await fetchPage(origin + path);
    if (!page) {
      result.errors.push({ url: origin + path, reason: 'Fetch failed' });
      continue;
    }
    const $ = cheerio.load(page.html);
    for (const fp of TECH_FINGERPRINTS) if (fp.test.test(page.html)) software.add(fp.name);

    const text = extractText($);
    if (text.length < 200) continue; // Not enough substance to cite.

    result.pages.push({
      id: `p${result.pages.length + 1}`,
      url: page.finalUrl,
      title: $('title').first().text().trim() || path,
      text,
      chars: text.length,
      fetchedAt: new Date().toISOString(),
    });
  }

  for (const page of result.pages) page.chars = page.text.length;
  result.detectedSoftware = [...software];
  return result;
}
