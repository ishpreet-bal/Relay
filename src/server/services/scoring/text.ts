import type { Seniority } from '@prisma/client';

/**
 * Generic text matching used by scoring and contact selection. Nothing here is
 * specific to an industry: titles, seniority and places are matched the same
 * way for a trucking client as for an industrial supplier. Industry knowledge
 * lives in ICPs and playbooks, which are data.
 */

const ABBREVIATIONS: Record<string, string> = {
  vp: 'vice president',
  svp: 'senior vice president',
  evp: 'executive vice president',
  avp: 'assistant vice president',
  mgr: 'manager',
  mngr: 'manager',
  dir: 'director',
  sr: 'senior',
  jr: 'junior',
  ops: 'operations',
  op: 'operations',
  scm: 'supply chain management',
  coo: 'chief operating officer',
  ceo: 'chief executive officer',
  cfo: 'chief financial officer',
  cto: 'chief technology officer',
  cio: 'chief information officer',
  gm: 'general manager',
  hr: 'human resources',
  it: 'information technology',
  eng: 'engineering',
  purch: 'purchasing',
  logs: 'logistics',
  '&': 'and',
};

/** Lowercase, expand common abbreviations, strip punctuation. */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .replace(/[–—/|,;:()]/g, ' ')
    .replace(/[^\w\s&.-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/\.$/, ''))
    .filter(Boolean)
    .map((w) => ABBREVIATIONS[w] ?? w)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(input: string): string[] {
  return normalizeText(input).split(' ').filter((t) => t.length > 1 && t !== 'of' && t !== 'the' && t !== 'and');
}

/**
 * True when every meaningful word of the target appears in the title, so
 * "Logistics Manager" matches "Senior Logistics Manager, Canada" but not
 * "Logistics Coordinator".
 */
export function titleMatches(title: string | null | undefined, target: string): boolean {
  if (!title) return false;
  const have = new Set(tokens(title));
  const want = tokens(target);
  return want.length > 0 && want.every((w) => have.has(w));
}

export function matchingTitle(title: string | null | undefined, targets: readonly string[]): string | null {
  return targets.find((t) => titleMatches(title, t)) ?? null;
}

const SENIORITY_RULES: Array<{ seniority: Seniority; pattern: RegExp }> = [
  { seniority: 'OWNER', pattern: /\b(owner|co-?owner|founder|co-?founder|proprietor|principal|president)\b/ },
  { seniority: 'C_LEVEL', pattern: /\b(chief \w+ officer|chief executive|managing director)\b/ },
  { seniority: 'VP', pattern: /\b(vice president)\b/ },
  { seniority: 'DIRECTOR', pattern: /\b(director|head of)\b/ },
  { seniority: 'MANAGER', pattern: /\b(manager|supervisor|superintendent|foreman)\b/ },
  { seniority: 'SENIOR', pattern: /\b(senior)\b/ },
  { seniority: 'ENTRY', pattern: /\b(coordinator|assistant|clerk|intern|junior)\b/ },
];

/** Best-effort seniority from a title; UNKNOWN rather than a guess. */
export function inferSeniority(title: string | null | undefined): Seniority {
  const t = normalizeText(title);
  if (!t) return 'UNKNOWN';
  // "Vice president" contains "president"; check it before owner-level rules.
  if (/\bvice president\b/.test(t)) return 'VP';
  for (const rule of SENIORITY_RULES) if (rule.pattern.test(t)) return rule.seniority;
  return 'UNKNOWN';
}

const DEPARTMENT_RULES: Array<{ department: string; pattern: RegExp }> = [
  { department: 'Logistics', pattern: /\b(logistics|transportation|shipping|freight|fleet|dispatch|traffic)\b/ },
  { department: 'Supply Chain', pattern: /\b(supply chain|procurement|purchasing|sourcing|buyer|materials)\b/ },
  { department: 'Operations', pattern: /\b(operations|plant|production|manufacturing|warehouse|distribution|site)\b/ },
  { department: 'Engineering', pattern: /\b(engineering|engineer|design|r&d|quality)\b/ },
  { department: 'Facilities', pattern: /\b(facilit\w*|property|building|maintenance)\b/ },
  { department: 'Finance', pattern: /\b(finance|financial|accounting|controller|treasury)\b/ },
  { department: 'IT', pattern: /\b(information technology|systems|network|technology|security)\b/ },
  { department: 'Human Resources', pattern: /\b(human resources|people|talent|recruit\w*)\b/ },
  { department: 'Sales', pattern: /\b(sales|business development|account)\b/ },
  { department: 'Marketing', pattern: /\b(marketing|brand|communications)\b/ },
  { department: 'Executive', pattern: /\b(owner|founder|president|chief|general manager|managing director)\b/ },
];

export function inferDepartment(title: string | null | undefined): string | null {
  const t = normalizeText(title);
  if (!t) return null;
  return DEPARTMENT_RULES.find((r) => r.pattern.test(t))?.department ?? null;
}

/** Province, state and country codes, so "ON" matches "Ontario". */
const PLACE_ALIASES: Record<string, string> = {
  ab: 'alberta', bc: 'british columbia', mb: 'manitoba', nb: 'new brunswick', nl: 'newfoundland and labrador',
  ns: 'nova scotia', nt: 'northwest territories', nu: 'nunavut', on: 'ontario', pe: 'prince edward island',
  qc: 'quebec', sk: 'saskatchewan', yt: 'yukon',
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california', co: 'colorado', ct: 'connecticut',
  de: 'delaware', fl: 'florida', ga: 'georgia', hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana',
  ia: 'iowa', ks: 'kansas', ky: 'kentucky', la: 'louisiana', me: 'maine', md: 'maryland', ma: 'massachusetts',
  mi: 'michigan', mn: 'minnesota', ms: 'mississippi', mo: 'missouri', mt: 'montana', ne: 'nebraska', nv: 'nevada',
  nh: 'new hampshire', nj: 'new jersey', nm: 'new mexico', ny: 'new york', nc: 'north carolina', nd: 'north dakota',
  oh: 'ohio', ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania', ri: 'rhode island', sc: 'south carolina',
  sd: 'south dakota', tn: 'tennessee', tx: 'texas', ut: 'utah', vt: 'vermont', va: 'virginia', wa: 'washington',
  wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming',
  usa: 'united states', us: 'united states', 'united states of america': 'united states',
  cda: 'canada', can: 'canada',
};

export function normalizePlace(input: string | null | undefined): string {
  const t = (input ?? '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return PLACE_ALIASES[t] ?? t;
}

/**
 * Whether an account's location satisfies one of the ICP's locations.
 * The country field is only consulted when the ICP location is itself a
 * country, so "Canada" matches anywhere in Canada but "Ontario" does not
 * match a Quebec account just because both are Canadian.
 */
export function locationMatches(
  account: { city?: string | null; region?: string | null; country?: string | null },
  targets: readonly string[],
): string | null {
  const places = {
    city: normalizePlace(account.city),
    region: normalizePlace(account.region),
    country: normalizePlace(account.country === 'CA' ? 'canada' : account.country === 'US' ? 'united states' : account.country),
  };
  for (const target of targets) {
    const want = normalizePlace(target);
    if (!want) continue;
    if (want === places.city || want === places.region || want === places.country) return target;
  }
  return null;
}

export function textIncludesAny(haystack: string, needles: readonly string[]): string | null {
  const h = normalizeText(haystack);
  if (!h) return null;
  return needles.find((n) => {
    const want = normalizeText(n);
    return want.length > 1 && h.includes(want);
  }) ?? null;
}
