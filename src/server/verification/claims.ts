import { differenceInCalendarDays } from 'date-fns';
import type { ClaimStatus, ClaimType, VerificationStatus } from '@prisma/client';
import type { ClaimResult, LedgerFact, ReportedClaim, VerificationResult } from './types';

/**
 * Claim-level verification for drafts.
 *
 * Only factual personalization needs proof. "We work with manufacturers that
 * ship between Ontario and Michigan" is sales copy about the sender and is
 * checked against the client's approved proof points; "You're hiring three
 * logistics coordinators" is a claim about the prospect and must rest on a
 * ledger fact. Ordinary sentences that assert nothing are left alone.
 *
 * For each claim the checks are, in order:
 *   1. it cites a ledger fact, and the sentence is really in the email;
 *   2. support — every specific (name, place, number, scale word) in the
 *      sentence also appears in the fact or its source quote, so
 *      "rapidly expanding across Canada" cannot ride on "opened a facility
 *      in Toronto";
 *   3. contradiction — a number that disagrees with the source;
 *   4. freshness — "recently" needs a dated source from the last 90 days,
 *      and time-sensitive claims (hiring, expansion…) go stale after 180;
 *   5. policy — whether the claim type is approved for sending unreviewed.
 *
 * The support check is lexical, not semantic. It is deliberately strict:
 * a false "unsupported" costs a human review, a false "supported" costs a
 * prospect's trust.
 */

const TIME_SENSITIVE: readonly ClaimType[] = [
  'HIRING', 'EXPANSION', 'NEW_LOCATION', 'FUNDING', 'NEW_CONTRACT', 'NEW_PRODUCT', 'LEADERSHIP_CHANGE', 'REGULATORY_EVENT',
];

const RECENCY = /\b(recent(ly)?|just|newly|latest|this (week|month|quarter|year)|last (week|month)|currently|right now|these days)\b/i;

const SCALE_WORDS = [
  'rapidly', 'quickly', 'fast', 'fastest', 'aggressively', 'massive', 'huge', 'major', 'significant', 'significantly',
  'largest', 'biggest', 'leading', 'top', 'nationwide', 'national', 'global', 'globally', 'worldwide', 'dramatically',
  'record', 'booming', 'explosive', 'across',
];

const NUMBER_WORDS: Record<string, string> = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', fifteen: '15', twenty: '20', thirty: '30', fifty: '50', hundred: '100', dozen: '12',
  second: '2', third: '3', fourth: '4', fifth: '5',
};

/** Phrases that assert knowledge of the recipient's situation. */
const ASSERTIONS: RegExp[] = [
  /\b(i|we) (noticed|saw|read|came across|heard|see|understand|learned)\b/i,
  /\bcongrat(s|ulations)\b/i,
  /\byour (recent|new|latest|growing|expanding)\b/i,
  /\byou('re| are) (hiring|expanding|opening|growing|moving|launching|adding|building|looking for)\b/i,
  /\byou (recently|just) \w+/i,
  /\b(it looks like|looks like you|seems like you)\b/i,
];

const EVIDENCE_WEIGHT = { VERIFIED: 1, PROVIDER_REPORTED: 0.9, UNVERIFIED: 0.6, REJECTED: 0 } as const;

const COMMON_CAPITALIZED = new Set([
  'i', 'i\'m', 'i\'ve', 'i\'d', 'hi', 'hello', 'thanks', 'thank', 'best', 'cheers', 'regards', 'monday', 'tuesday',
  'wednesday', 'thursday', 'friday', 'mr', 'ms', 'mrs', 'dr',
]);

export function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, ' ')
    .replace(/[^\w\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function stem(word: string) {
  return word.replace(/(ing|ed|es|s)$/, '');
}

/** Words in the sentence that introduce checkable specifics. */
export function specificTerms(sentence: string, allowed: readonly string[]) {
  const allowedTokens = new Set(allowed.flatMap((a) => normalize(a).split(' ')).filter(Boolean));
  const words = sentence.split(/\s+/);
  const properNouns: string[] = [];
  words.forEach((raw, i) => {
    const w = raw.replace(/^[^\w]+|[^\w']+$/g, '');
    if (!w || i === 0) return; // sentence-initial capitals are not evidence of a name
    if (!/^[A-Z][\w'-]*$/.test(w)) return;
    const lower = w.toLowerCase().replace(/'s$/, '');
    if (COMMON_CAPITALIZED.has(lower) || allowedTokens.has(lower)) return;
    properNouns.push(lower);
  });

  const n = normalize(sentence);
  const numbers = [
    ...(n.match(/\b\d[\d,.]*\b/g) ?? []).map((d) => d.replace(/,/g, '')),
    ...n.split(' ').filter((w) => NUMBER_WORDS[w]).map((w) => NUMBER_WORDS[w]!),
  ];
  const scaleWords = SCALE_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(n));
  return { properNouns: [...new Set(properNouns)], numbers: [...new Set(numbers)], scaleWords };
}

function numbersIn(text: string) {
  const n = normalize(text);
  return new Set([
    ...(n.match(/\b\d[\d,.]*\b/g) ?? []).map((d) => d.replace(/,/g, '')),
    ...n.split(' ').filter((w) => NUMBER_WORDS[w]).map((w) => NUMBER_WORDS[w]!),
  ]);
}

function supportedBy(term: string, sourceText: string) {
  const source = normalize(sourceText);
  if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(source)) return true;
  const s = stem(term);
  return s.length >= 4 && source.split(' ').some((w) => stem(w) === s);
}

export interface SupportCheck {
  score: number;
  unmatched: string[];
  contradiction: string | null;
}

/** How well a sentence is supported by one fact, before freshness and policy. */
export function checkSupport(sentence: string, fact: LedgerFact, allowed: readonly string[]): SupportCheck {
  const source = `${fact.statement} ${fact.sourceQuote ?? ''}`;
  const { properNouns, numbers, scaleWords } = specificTerms(sentence, allowed);

  const unmatched: string[] = [];
  let score = fact.kind === 'sender' ? 1 : EVIDENCE_WEIGHT[fact.evidenceStatus];

  for (const p of properNouns) if (!supportedBy(p, source)) { unmatched.push(p); score -= 0.35; }
  for (const w of scaleWords) if (!supportedBy(w, source)) { unmatched.push(w); score -= 0.2; }

  const sourceNumbers = numbersIn(source);
  let contradiction: string | null = null;
  for (const num of numbers) {
    if (sourceNumbers.has(num)) continue;
    if (sourceNumbers.size > 0) contradiction = `Says ${num}; the source says ${[...sourceNumbers].join(', ')}`;
    unmatched.push(num);
    score -= 0.35;
  }

  return { score: Math.max(0, Math.round(score * 100) / 100), unmatched, contradiction };
}

export interface FreshnessCheck {
  stale: boolean;
  ageDays: number | null;
  reason: string | null;
}

export function checkFreshness(sentence: string, fact: LedgerFact, now: Date): FreshnessCheck {
  const recency = RECENCY.test(sentence);
  const sensitive = fact.claimType ? TIME_SENSITIVE.includes(fact.claimType) : false;
  const dated = fact.eventDate ?? null;
  const reference = dated ?? fact.detectedAt;
  const ageDays = reference ? Math.max(0, differenceInCalendarDays(now, reference)) : null;

  if (recency) {
    if (!dated) {
      return { stale: true, ageDays, reason: "The source doesn't say when this happened, so it can't be called recent." };
    }
    if (ageDays! > 90) {
      return { stale: true, ageDays, reason: `Described as recent, but the source is ${ageDays} days old.` };
    }
  }
  if (sensitive && ageDays !== null && ageDays > 180) {
    return { stale: true, ageDays, reason: `Time-sensitive, and the evidence is ${ageDays} days old.` };
  }
  return { stale: false, ageDays, reason: null };
}

function overlaps(a: string, b: string) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na.includes(nb.slice(0, 40)) || nb.includes(na.slice(0, 40))) return true;
  const ta = new Set(na.split(' '));
  const tb = nb.split(' ');
  const shared = tb.filter((t) => ta.has(t)).length;
  return shared / Math.max(tb.length, 1) >= 0.7;
}

function statusFor(score: number): ClaimStatus {
  if (score >= 0.85) return 'SUPPORTED';
  if (score >= 0.5) return 'PARTIALLY_SUPPORTED';
  return 'UNSUPPORTED';
}

export function verifyClaims(params: {
  subject: string;
  body: string;
  reported: ReportedClaim[];
  ledger: LedgerFact[];
  approvedClaimTypes: readonly ClaimType[];
  /** Names the draft may use without evidence: recipient, their company, our client, the sender. */
  knownEntities: readonly string[];
  now?: Date;
}): VerificationResult {
  const now = params.now ?? new Date();
  const ledger = new Map(params.ledger.map((f) => [f.id, f]));
  const sentences = [...splitSentences(params.subject), ...splitSentences(params.body)];
  const claims: ClaimResult[] = [];
  const reasons: string[] = [];

  const base = (text: string): Omit<ClaimResult, 'kind' | 'status' | 'supportScore' | 'reason'> => ({
    text, claimType: null, approvedType: false, factId: null, signalId: null, proofPointId: null,
    sourceUrl: null, sourceQuote: null, evidenceDate: null, freshnessDays: null,
  });

  const covered: string[] = [];
  for (const r of params.reported ?? []) {
    const sentence = r.sentence?.trim();
    if (!sentence) continue;
    // A claim the model reports but that isn't in the email is not a claim
    // the email makes. Real assertions are caught by the sweep below.
    if (!sentences.some((s) => overlaps(s, sentence))) continue;
    covered.push(sentence);

    const kind = r.kind === 'SENDER' ? 'SENDER_PROOF' : 'PROSPECT_FACT';
    const fact = r.factId ? ledger.get(r.factId) : undefined;
    if (!fact) {
      claims.push({
        ...base(sentence), kind, status: 'UNSUPPORTED', supportScore: 0,
        reason: r.factId ? `Cites ${r.factId}, which is not in the fact ledger.` : 'Not tied to any fact.',
      });
      continue;
    }

    const support = checkSupport(sentence, fact, params.knownEntities);
    const fresh = fact.kind === 'prospect' ? checkFreshness(sentence, fact, now) : { stale: false, ageDays: null, reason: null };
    const approvedType = fact.kind === 'sender' || (!!fact.claimType && params.approvedClaimTypes.includes(fact.claimType));

    let status: ClaimStatus = statusFor(support.score);
    let reason: string | null = support.unmatched.length
      ? `Not in the source: ${support.unmatched.join(', ')}.`
      : null;
    if (support.contradiction) { status = 'CONTRADICTED'; reason = support.contradiction; }
    else if (fresh.stale && status !== 'UNSUPPORTED') { status = 'STALE'; reason = fresh.reason; }

    claims.push({
      text: sentence,
      kind: fact.kind === 'sender' ? 'SENDER_PROOF' : 'PROSPECT_FACT',
      claimType: fact.claimType,
      status,
      supportScore: support.score,
      approvedType,
      factId: fact.id,
      signalId: fact.signalId ?? null,
      proofPointId: fact.proofPointId ?? null,
      sourceUrl: fact.sourceUrl,
      sourceQuote: fact.sourceQuote,
      evidenceDate: fact.eventDate,
      freshnessDays: fresh.ageDays,
      reason,
    });
  }

  // Sweep: any sentence that asserts knowledge of the recipient but was not
  // reported as a claim is an unsupported claim.
  for (const sentence of sentences) {
    if (!ASSERTIONS.some((p) => p.test(sentence))) continue;
    if (covered.some((c) => overlaps(sentence, c))) continue;
    claims.push({
      ...base(sentence), kind: 'PROSPECT_FACT', status: 'UNSUPPORTED', supportScore: 0,
      reason: "States something about them that isn't tied to any fact.",
    });
  }

  const factual = claims.filter((c) => c.kind !== 'GENERAL_COPY');
  const count = (s: ClaimStatus) => factual.filter((c) => c.status === s).length;
  const unapproved = factual.filter((c) => c.kind === 'PROSPECT_FACT' && c.status !== 'UNSUPPORTED' && !c.approvedType).length;

  let status: VerificationStatus;
  if (count('CONTRADICTED')) { status = 'BLOCKED'; reasons.push('A claim contradicts its source.'); }
  else if (count('UNSUPPORTED')) { status = 'UNSUPPORTED'; reasons.push(`${count('UNSUPPORTED')} claim(s) without supporting evidence.`); }
  else if (count('STALE')) { status = 'REVIEW_REQUIRED'; reasons.push('Some evidence is too old for how it is described.'); }
  else if (unapproved) { status = 'REVIEW_REQUIRED'; reasons.push(`${unapproved} claim(s) of a type not approved for automatic sending.`); }
  else if (count('PARTIALLY_SUPPORTED')) { status = 'PARTIALLY_VERIFIED'; reasons.push('Some claims are only partly supported.'); }
  else status = 'VERIFIED';

  let score = factual.length ? factual.reduce((s, c) => s + c.supportScore, 0) / factual.length : 1;
  if (status === 'BLOCKED' || status === 'UNSUPPORTED') score = Math.min(score, 0.4);
  if (status === 'REVIEW_REQUIRED') score = Math.min(score, 0.84);

  return {
    status,
    score: Math.round(score * 100) / 100,
    claims,
    summary: {
      factual: factual.length,
      supported: count('SUPPORTED'),
      partial: count('PARTIALLY_SUPPORTED'),
      unsupported: count('UNSUPPORTED'),
      stale: count('STALE'),
      contradicted: count('CONTRADICTED'),
      unapprovedTypes: unapproved,
      reasons,
    },
  };
}
