import { nameSimilarity, normalizeLocality, normalizeRegion } from './normalize';

/**
 * Is this incoming company one we already have?
 *
 * Each rule looks at one kind of evidence and returns a score with a reason a
 * person can read. The strongest evidence wins, independent agreeing
 * evidence adds a little, and contradicting evidence (two different company
 * domains) caps the score. Above MATCH the records are treated as the same
 * company; between REVIEW and MATCH a person decides; below REVIEW it is new.
 */

export const MATCH_THRESHOLD = 0.9;
export const REVIEW_THRESHOLD = 0.6;

export interface CompanyIdentity {
  normalizedName: string;
  domain: string | null;
  city: string | null;
  region: string | null;
  /** Street address, normalized with normalizeLocality. */
  address: string | null;
  /** Digits only, as normalized by suppression.normalizePhone. */
  phone: string | null;
  identifiers: Array<{ provider: string; externalId: string }>;
  /** Company domains of known contacts' emails (free mailboxes excluded). */
  emailDomains: string[];
}

export interface MatchReason { code: string; label: string; score: number }

export interface MatchScore { score: number; reasons: MatchReason[]; conflict: string | null }

export function scoreMatch(incoming: CompanyIdentity, existing: CompanyIdentity): MatchScore {
  const reasons: MatchReason[] = [];
  const add = (code: string, label: string, score: number) => reasons.push({ code, label, score });

  const sharedId = incoming.identifiers.find((i) =>
    existing.identifiers.some((e) => e.provider === i.provider && e.externalId === i.externalId));
  if (sharedId) add('IDENTIFIER', `Same ${sharedId.provider} id`, 1);

  if (incoming.domain && existing.domain && incoming.domain === existing.domain) add('DOMAIN', `Same website (${incoming.domain})`, 0.98);

  const emailHit = (incoming.domain && existing.emailDomains.includes(incoming.domain))
    || (existing.domain && incoming.emailDomains.includes(existing.domain));
  if (emailHit) add('EMAIL_DOMAIN', 'A contact\'s email uses this website\'s domain', 0.9);

  if (incoming.phone && existing.phone && incoming.phone.length >= 10 && incoming.phone === existing.phone) {
    add('PHONE', 'Same main phone number', 0.8);
  }

  const sameCity = !!incoming.city && !!existing.city && normalizeLocality(incoming.city) === normalizeLocality(existing.city);
  const differentCity = !!incoming.city && !!existing.city && !sameCity;
  const sameRegion = !!incoming.region && !!existing.region && normalizeRegion(incoming.region) === normalizeRegion(existing.region);

  if (incoming.normalizedName && existing.normalizedName) {
    const exact = incoming.normalizedName === existing.normalizedName;
    const similarity = exact ? 1 : nameSimilarity(incoming.normalizedName, existing.normalizedName);
    const sameAddress = !!incoming.address && !!existing.address && incoming.address === existing.address;
    const differentAddress = !!incoming.address && !!existing.address && !sameAddress;
    if (exact && sameAddress) add('NAME_ADDRESS', 'Same name at the same address', 0.97);
    else if (exact && sameCity && differentAddress) add('NAME_CITY_OTHER_ADDRESS', 'Same name and city, different address — a branch or a duplicate', 0.7);
    else if (exact && sameCity) add('NAME_CITY', 'Same name in the same city', 0.92);
    else if (exact && differentCity) add('NAME_OTHER_CITY', 'Same name in a different city — possibly a branch', 0.62);
    else if (exact && sameRegion) add('NAME_REGION', 'Same name in the same province or state', 0.8);
    else if (exact) add('NAME', 'Same name, location unknown', 0.72);
    else if (similarity >= 0.93 && sameCity) add('SIMILAR_NAME_CITY', `Very similar name in the same city (${Math.round(similarity * 100)}%)`, 0.78);
    else if (similarity >= 0.93 && !differentCity) add('SIMILAR_NAME', `Very similar name (${Math.round(similarity * 100)}%)`, 0.62);
  }

  if (!reasons.length) return { score: 0, reasons, conflict: null };

  const sorted = [...reasons].sort((a, b) => b.score - a.score);
  let score = sorted[0]!.score;
  // Two independent pieces of decent evidence are stronger than either.
  const supporting = sorted.slice(1).filter((r) => r.score >= 0.75 && r.code !== sorted[0]!.code);
  if (supporting.length) score = Math.min(0.99, score + 0.1);

  // Different company domains on both sides means different companies,
  // unless an outside source says they share an id.
  let conflict: string | null = null;
  if (!sharedId && incoming.domain && existing.domain && incoming.domain !== existing.domain) {
    conflict = `Different websites (${incoming.domain} vs ${existing.domain})`;
    score = Math.min(score, 0.5);
  }
  return { score: Math.round(score * 100) / 100, reasons: sorted, conflict };
}

export type MatchDecision<T> =
  | { action: 'match'; match: T; score: MatchScore }
  | { action: 'review'; match: T; score: MatchScore }
  | { action: 'new' };

/** The best candidate and what to do about it. */
export function decide<T>(candidates: Array<{ item: T; score: MatchScore }>): MatchDecision<T> {
  const best = [...candidates].sort((a, b) => b.score.score - a.score.score)[0];
  if (!best || best.score.score < REVIEW_THRESHOLD) return { action: 'new' };
  if (best.score.score >= MATCH_THRESHOLD) return { action: 'match', match: best.item, score: best.score };
  return { action: 'review', match: best.item, score: best.score };
}

/**
 * Which fields of an incoming record may fill an existing one. Existing
 * values are never overwritten here: a matched record is enriched, not
 * replaced, because what is already stored may be better evidence (typed by
 * a person, or confirmed from the company's own site).
 */
export function fillableFields<T extends Record<string, unknown>>(existing: T, incoming: Partial<T>, fields: readonly (keyof T)[]): Partial<T> {
  const patch: Partial<T> = {};
  for (const f of fields) {
    const current = existing[f];
    const next = incoming[f];
    const empty = current === null || current === undefined || current === '' || (Array.isArray(current) && current.length === 0);
    const present = next !== null && next !== undefined && next !== '' && !(Array.isArray(next) && next.length === 0);
    if (empty && present) patch[f] = next as T[keyof T];
  }
  return patch;
}
