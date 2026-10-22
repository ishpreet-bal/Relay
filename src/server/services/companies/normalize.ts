/**
 * Company identity: turning the many ways a business is written down into
 * keys that compare equal. Pure functions — no database — so they can be
 * tested exhaustively and reused by import, manual entry and discovery.
 */

// Legal-form and filler words that don't distinguish one company from
// another. Removed only as whole words.
const LEGAL_SUFFIXES = new Set([
  'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'ltd', 'limited', 'llc', 'llp', 'lp', 'plc',
  'ltee', 'limitee', 'enr', 'pllc', 'pc', 'gmbh', 'sa', 'sarl', 'bv', 'pty', 'ulc',
]);

/**
 * Lower case, accents folded, punctuation dropped, "&" read as "and",
 * legal suffixes removed. "Maple Plastics Inc." and "MAPLE PLASTICS, INC"
 * both become "maple plastics". A leading "the" is dropped.
 */
export function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return '';
  const words = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1]!)) words.pop();
  if (words.length > 1 && words[0] === 'the') words.shift();
  return words.join(' ');
}

/**
 * Hosts that many unrelated businesses share. A Facebook page or a Linktree
 * is a profile, not a company domain, and must never be used to decide that
 * two businesses are the same.
 */
const SHARED_HOSTS = [
  'facebook.com', 'fb.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'tiktok.com', 'youtube.com',
  'yelp.com', 'yelp.ca', 'google.com', 'goo.gl', 'g.page', 'business.site', 'linktr.ee', 'linkin.bio', 'beacons.ai',
  'squareup.com', 'square.site', 'booksy.com', 'fresha.com', 'vagaro.com', 'schedulicity.com', 'opentable.com',
  'ubereats.com', 'doordash.com', 'skipthedishes.com', 'canada411.ca', 'yellowpages.ca', 'yellowpages.com',
  'kijiji.ca', 'craigslist.org', 'wixsite.com', 'wordpress.com', 'blogspot.com', 'weebly.com', 'godaddysites.com',
  'myshopify.com', 'square.online', 'carrd.co', 'sites.google.com',
];

const SOCIAL_KEYS: Record<string, string> = {
  'facebook.com': 'facebook', 'fb.com': 'facebook', 'instagram.com': 'instagram', 'linkedin.com': 'linkedin',
  'twitter.com': 'x', 'x.com': 'x', 'tiktok.com': 'tiktok', 'youtube.com': 'youtube',
};

/** Free mailbox providers: an email at one of these says nothing about the company. */
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.ca', 'hotmail.com', 'hotmail.ca', 'outlook.com', 'live.com',
  'live.ca', 'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'protonmail.com', 'proton.me', 'gmx.com',
  'rogers.com', 'bell.net', 'sympatico.ca', 'shaw.ca', 'telus.net', 'videotron.ca', 'cogeco.ca', 'yandex.com',
]);

function hostOf(input: string): string | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`);
    return url.hostname.replace(/^(www\d?|m|mobile)\./, '') || null;
  } catch {
    return null;
  }
}

function sharedHost(host: string): string | null {
  return SHARED_HOSTS.find((h) => host === h || host.endsWith(`.${h}`)) ?? null;
}

/**
 * The company's own domain from a website URL, or null when the URL is a
 * shared platform (social page, booking site, free site builder) rather than
 * a domain the company controls.
 */
export function canonicalDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  const host = hostOf(url);
  if (!host || !host.includes('.') || /^\d+(\.\d+){3}$/.test(host)) return null;
  if (sharedHost(host)) return null;
  return host;
}

/** For a website that is really a social profile: which network it is. */
export function socialNetworkOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const host = hostOf(url);
  const shared = host ? sharedHost(host) : null;
  return shared ? SOCIAL_KEYS[shared] ?? null : null;
}

/** The company domain implied by a business email, or null for free mailboxes. */
export function emailDomain(email: string | null | undefined): string | null {
  const at = email?.lastIndexOf('@') ?? -1;
  if (!email || at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain.includes('.') || FREE_EMAIL_DOMAINS.has(domain)) return null;
  return domain;
}

export function isFreeEmailDomain(domain: string) {
  return FREE_EMAIL_DOMAINS.has(domain.toLowerCase());
}

/** City or region compared loosely: case, accents and punctuation ignored. */
export function normalizeLocality(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^city of /, '');
}

const REGION_CODES: Record<string, string> = {
  ontario: 'on', quebec: 'qc', 'british columbia': 'bc', alberta: 'ab', manitoba: 'mb', saskatchewan: 'sk',
  'nova scotia': 'ns', 'new brunswick': 'nb', 'newfoundland and labrador': 'nl', 'prince edward island': 'pe',
  yukon: 'yt', 'northwest territories': 'nt', nunavut: 'nu',
  michigan: 'mi', ohio: 'oh', 'new york': 'ny', pennsylvania: 'pa', illinois: 'il', indiana: 'in', texas: 'tx',
  california: 'ca', florida: 'fl', georgia: 'ga', 'north carolina': 'nc', wisconsin: 'wi', minnesota: 'mn',
};

/** "Ontario", "ON" and "on." all become "on". Unknown regions pass through normalized. */
export function normalizeRegion(value: string | null | undefined): string {
  const v = normalizeLocality(value);
  return REGION_CODES[v] ?? v;
}

/**
 * Similarity of two normalized names, 0–1, using Jaro–Winkler: robust to
 * small typos and to one name being a prefix of the other ("Acme Machining"
 * vs "Acme Machining Services") while keeping unrelated names apart.
 */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatch = new Array<boolean>(a.length).fill(false);
  const bMatch = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(b.length - 1, i + range);
    for (let j = lo; j <= hi; j++) {
      if (bMatch[j] || a[i] !== b[j]) continue;
      aMatch[i] = bMatch[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatch[i]) continue;
    while (!bMatch[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}
