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

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, (c) => (c === '\u2018' || c === '\u2019' ? "'" : '"'))
    .replace(/&(amp|nbsp|#39|quot);/g, ' ')
    .replace(/[^\w\s'"-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string) {
  return normalize(s).split(' ').filter((t) => t.length > 2);
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
    if (normalize(page.text).includes(normalize(item.quote))) {
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
 * Filters a list of claims down to those with at least one verified citation.
 * A claim that loses all its evidence is dropped entirely — degrading it to
 * "unsourced" and showing it anyway would defeat the point.
 */
export function groundClaims<T extends { title: string; evidence: Evidence[] }>(
  claims: T[],
  pages: CrawledPage[],
): { grounded: Array<T & { citations: VerifiedCitation[] }>; report: GroundingReport } {
  const grounded: Array<T & { citations: VerifiedCitation[] }> = [];
  const rejectedClaims: GroundingReport['rejectedClaims'] = [];

  for (const claim of claims) {
    const { verified, rejected } = verifyEvidence(claim.evidence ?? [], pages);
    if (verified.length === 0) {
      rejectedClaims.push({
        claim: claim.title,
        reason: rejected[0]?.reason ?? 'No evidence provided',
      });
      continue;
    }
    grounded.push({ ...claim, citations: verified });
  }

  return {
    grounded,
    report: {
      totalClaims: claims.length,
      groundedClaims: grounded.length,
      rejectedClaims,
      groundingRate: claims.length ? grounded.length / claims.length : 0,
    },
  };
}
