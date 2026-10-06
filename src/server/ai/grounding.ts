import type { CrawledPage } from '@/server/services/crawler';

/**
 * The verifier. Model output arrives with quotes it claims came from specific
 * pages; this checks each one against the text actually crawled and discards
 * anything that fails. This is the difference between "we told the model not to
 * make things up" and "a fabricated claim cannot reach the operator's screen."
 *
 * Verbatim quoting is required by the prompt, but models drift on whitespace,
 * punctuation, and entity encoding, so exact matching alone would reject good
 * claims. The ladder is: exact → normalized → token-overlap above threshold.
 */

export interface Evidence { pageId: string; quote: string }
export interface VerifiedCitation extends Evidence {
  url: string;
  pageTitle: string;
  matchType: 'exact' | 'normalized' | 'fuzzy';
  similarity: number;
}

export interface GroundingReport {
  totalClaims: number;
  groundedClaims: number;
  rejectedClaims: Array<{ claim: string; reason: string }>;
  groundingRate: number;
}

const FUZZY_THRESHOLD = 0.75;
const MIN_QUOTE_WORDS = 4;

export function normalizeForMatch(s: string) {
  return s
    .toLowerCase()
    .replace(/[‘’“”]/g, (c) => (c === '‘' || c === '’' ? "'" : '"'))
    .replace(/&(amp|nbsp|#39|quot);/g, ' ')
    .replace(/[^\w\s'"-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string) {
  return normalizeForMatch(s).split(' ').filter((t) => t.length > 2);
}

/** Fraction of the quote's tokens that appear, in order, in the page text. */
function orderedOverlap(quote: string, pageText: string): number {
  const q = tokens(quote);
  if (!q.length) return 0;
  const p = tokens(pageText);
  let matched = 0;
  let cursor = 0;
  for (const token of q) {
    const found = p.indexOf(token, cursor);
    if (found !== -1) { matched++; cursor = found + 1; }
  }
  return matched / q.length;
}

export function verifyEvidence(
  evidence: Evidence[],
  pages: CrawledPage[],
): { verified: VerifiedCitation[]; rejected: Array<{ quote: string; reason: string }> } {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const verified: VerifiedCitation[] = [];
  const rejected: Array<{ quote: string; reason: string }> = [];

  for (const item of evidence) {
    const page = byId.get(item.pageId);
    if (!page) {
      rejected.push({ quote: item.quote, reason: `Cited page ${item.pageId}, which was not crawled` });
      continue;
    }
    if (tokens(item.quote).length < MIN_QUOTE_WORDS) {
      rejected.push({ quote: item.quote, reason: 'Quote too short to verify' });
      continue;
    }

    const base = { pageId: item.pageId, quote: item.quote, url: page.url, pageTitle: page.title };

    if (page.text.includes(item.quote)) {
      verified.push({ ...base, matchType: 'exact', similarity: 1 });
      continue;
    }
    if (normalizeForMatch(page.text).includes(normalizeForMatch(item.quote))) {
      verified.push({ ...base, matchType: 'normalized', similarity: 1 });
      continue;
    }
    const similarity = orderedOverlap(item.quote, page.text);
    if (similarity >= FUZZY_THRESHOLD) {
      verified.push({ ...base, matchType: 'fuzzy', similarity: Math.round(similarity * 100) / 100 });
      continue;
    }
    rejected.push({
      quote: item.quote,
      reason: `Not found on ${page.url} (${Math.round(similarity * 100)}% token match)`,
    });
  }

  return { verified, rejected };
}

/**
 * Filters items down to those with at least one verified citation. An item
 * that loses all its evidence is dropped entirely — degrading it to
 * "unsourced" and showing it anyway would defeat the point.
 */
export function groundItems<T extends { evidence?: Evidence[] }>(
  items: T[],
  pages: CrawledPage[],
  label: (item: T) => string,
): { grounded: Array<Omit<T, 'evidence'> & { citations: VerifiedCitation[] }>; report: GroundingReport } {
  const grounded: Array<Omit<T, 'evidence'> & { citations: VerifiedCitation[] }> = [];
  const rejectedClaims: GroundingReport['rejectedClaims'] = [];

  for (const item of items) {
    const { verified, rejected } = verifyEvidence(item.evidence ?? [], pages);
    if (verified.length === 0) {
      rejectedClaims.push({ claim: label(item), reason: rejected[0]?.reason ?? 'No evidence provided' });
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { evidence, ...rest } = item;
    grounded.push({ ...rest, citations: verified });
  }

  return {
    grounded,
    report: {
      totalClaims: items.length,
      groundedClaims: grounded.length,
      rejectedClaims,
      groundingRate: items.length ? grounded.length / items.length : 0,
    },
  };
}

/** Back-compatible wrapper for items labelled by `title`. */
export function groundClaims<T extends { title: string; evidence: Evidence[] }>(items: T[], pages: CrawledPage[]) {
  return groundItems(items, pages, (i) => i.title);
}

export function mergeReports(...reports: GroundingReport[]): GroundingReport {
  const total = reports.reduce((s, r) => s + r.totalClaims, 0);
  const grounded = reports.reduce((s, r) => s + r.groundedClaims, 0);
  return {
    totalClaims: total,
    groundedClaims: grounded,
    rejectedClaims: reports.flatMap((r) => r.rejectedClaims),
    groundingRate: total ? grounded / total : 0,
  };
}

/**
 * Parses a model-reported event date ("2026-09", "2026-09-14", "September
 * 2026"), accepting it only if it is a real date that is not in the future.
 * An unparseable date becomes null — "we don't know when" — never a guess.
 */
export function parseEventDate(value: unknown, now = new Date()): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const v = value.trim();
  let date: Date | null = null;
  const iso = v.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (iso) {
    date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, iso[3] ? Number(iso[3]) : 1));
  } else {
    const parsed = new Date(v);
    date = Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (!date || Number.isNaN(date.getTime())) return null;
  if (date.getTime() > now.getTime() + 24 * 3600_000) return null;
  if (date.getUTCFullYear() < 1950) return null;
  return date;
}
