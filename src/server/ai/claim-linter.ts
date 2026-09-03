import type { Fact } from './prompts/personalize';

export interface UnverifiedClaim {
  text: string;
  reason: string;
  severity: 'block' | 'warn';
}

/**
 * A second pass over the generated body, independent of the model's own
 * accounting. The model reports which facts it used; the linter looks for
 * specifics it *didn't* report — the failure mode where a draft quietly
 * acquires a number, a software name, or a claim of familiarity that no fact
 * supports.
 *
 * 'block' findings hold the draft out of the ready queue until a human edits
 * it. 'warn' findings are surfaced but don't block.
 */

// Phrases that assert first-hand knowledge of the recipient. Harmless in a
// VERIFIED draft, dishonest in a CONTEXTUAL one.
const FAMILIARITY_PATTERNS: RegExp[] = [
  /\bI (noticed|saw|read|came across|was looking at|checked out)\b/i,
  /\b(on|from) your (site|website|page|homepage)\b/i,
  /\byour (team|shop|clinic|practice|firm|office) (is|seems|appears|looks like|currently)\b/i,
  /\bit looks like you\b/i,
  /\bwhen I (visited|browsed|clicked)\b/i,
];

// Fabrication risks in any tier.
const HARD_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b\d{1,3}\s?%/g, reason: 'Percentage claim' },
  { pattern: /\$\s?[\d,]+/g, reason: 'Dollar figure' },
  { pattern: /\b(guarantee|guaranteed|we will save you|you will save)\b/gi, reason: 'Outcome promise' },
  { pattern: /\b(referred by|our mutual|we met at|as discussed|following up on our)\b/gi, reason: 'Implies a prior relationship' },
  { pattern: /\b\d+\s?(years|employees|staff|locations|clients|customers)\b/gi, reason: 'Specific count about their business' },
];

const KNOWN_SOFTWARE = /\b(quickbooks|xero|sage|salesforce|hubspot|jobber|servicetitan|housecall ?pro|dentrix|open ?dental|clio|sharepoint|netsuite|sap|shopify|monday\.com|asana|trello)\b/gi;

function normalize(s: string) {
  return s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function lintDraft(params: {
  body: string;
  subject: string;
  facts: Fact[];
  factsUsed: Array<{ factId: string; sentence: string }>;
  tier: 'VERIFIED' | 'CONTEXTUAL';
}): UnverifiedClaim[] {
  const findings: UnverifiedClaim[] = [];
  const text = `${params.subject}\n${params.body}`;
  const ledgerText = normalize(params.facts.map((f) => f.statement).join(' '));
  const validIds = new Set(params.facts.map((f) => f.id));

  // 1. Reported fact usage must actually check out.
  for (const used of params.factsUsed ?? []) {
    if (!validIds.has(used.factId)) {
      findings.push({
        text: used.sentence,
        reason: `Cites fact ${used.factId}, which is not in the ledger`,
        severity: 'block',
      });
      continue;
    }
    if (used.sentence && !normalize(params.body).includes(normalize(used.sentence).slice(0, 40))) {
      findings.push({
        text: used.sentence,
        reason: 'Claimed sentence does not appear in the body',
        severity: 'warn',
      });
    }
  }

  // 2. Hard fabrication patterns.
  for (const { pattern, reason } of HARD_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0];
      // A number that appears verbatim in a ledger fact is fine.
      if (ledgerText.includes(normalize(value))) continue;
      findings.push({ text: value, reason, severity: 'block' });
    }
  }

  // 3. Software named without ledger support.
  for (const match of text.matchAll(KNOWN_SOFTWARE)) {
    if (!ledgerText.includes(normalize(match[0]))) {
      findings.push({
        text: match[0],
        reason: 'Names software with no supporting fact',
        severity: 'block',
      });
    }
  }

  // 4. Contextual drafts must not claim familiarity. This is the guardrail that
  // keeps the fallback tier honest rather than fake-personalized.
  if (params.tier === 'CONTEXTUAL') {
    for (const pattern of FAMILIARITY_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        findings.push({
          text: match[0],
          reason: 'Claims to have looked at their site, but research found nothing citable',
          severity: 'block',
        });
      }
    }
  }

  // Dedupe by text + reason.
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.text}|${f.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
