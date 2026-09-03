/**
 * The draft linter. Runs on every generated email before a human ever sees it.
 *
 * Two jobs:
 *  1. On CONTEXTUAL drafts, catch any claim implying knowledge we don't have.
 *     This is the guardrail on the "write something useful anyway" path — the
 *     failure mode there is slow drift into invented specifics, and drift is
 *     invisible without an automated check.
 *  2. On every draft, catch the tells that make outreach read as mass mail.
 */

export interface LintFinding {
  severity: 'block' | 'warn';
  rule: string;
  message: string;
  excerpt: string;
}

/** Phrases that assert first-hand knowledge of the recipient's business. */
const KNOWLEDGE_CLAIMS: Array<{ pattern: RegExp; rule: string; message: string }> = [
  { pattern: /\b(i|we)\s+(noticed|saw|read|came across|spotted|found|checked out|took a look at)\b/i,
    rule: 'implied-research', message: 'Claims to have looked at them, but research found nothing.' },
  { pattern: /\b(looking at|browsing|reading|visiting)\s+your\b/i,
    rule: 'implied-research', message: 'Implies having viewed their site or materials.' },
  { pattern: /\byour\s+(current|existing|team|staff|crew|process|workflow|system|software|platform|tools?|setup|website|site|scheduling|invoicing|intake|booking)\b/i,
    rule: 'unknown-specific', message: 'Describes something about their operations we did not verify.' },
  { pattern: /\byou\s+(currently|still|probably|likely)\s+\w+/i,
    rule: 'unknown-specific', message: 'Asserts how they currently operate.' },
  { pattern: /\b(impressed|love what you|great work on|admire)\b/i,
    rule: 'false-flattery', message: 'Flatters work we have not seen.' },
];

/** Numbers and named tools are the highest-risk fabrications in any tier. */
const RISKY_SPECIFICS: Array<{ pattern: RegExp; rule: string; message: string }> = [
  { pattern: /\b\d{1,3}\s?%/, rule: 'unsourced-statistic', message: 'Percentage claim with no cited source.' },
  { pattern: /\b(save|saving|saved|cut|reduce[ds]?)\s+(you\s+)?\$?\d/i,
    rule: 'outcome-promise', message: 'Promises a specific quantified outcome.' },
  { pattern: /\b\d+\s*(hours?|hrs?)\s*(a|per)\s*(week|month|day)\b/i,
    rule: 'unsourced-estimate', message: 'States an hours figure; confirm it came from research.' },
  { pattern: /\b(quickbooks|xero|sage|salesforce|hubspot|jobber|servicetitan|dentrix|clio|sharepoint|netsuite)\b/i,
    rule: 'named-software', message: 'Names specific software.' },
];

/** Tells that make a human-written email read as a template. */
const MASS_MAIL_TELLS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\bi hope this (email )?finds you well\b/i, message: 'Stock opener.' },
  { pattern: /\bquick question\b/i, message: 'Overused subject/opener.' },
  { pattern: /\b(just )?(circling back|touching base|following up on my last)\b/i, message: 'Filler follow-up phrasing.' },
  { pattern: /\bi wanted to reach out\b/i, message: 'Announces the email instead of starting it.' },
  { pattern: /\bgame[- ]?chang(er|ing)|revolutioniz|cutting[- ]edge|leverage synergi/i, message: 'Marketing language.' },
  { pattern: /\bto whom it may concern\b/i, message: 'No recipient name.' },
  { pattern: /\{\{\s*\w+\s*\}\}/, message: 'Unrendered merge tag left in the body.' },
];

export function lintDraft(input: {
  subject: string;
  body: string;
  tier: 'VERIFIED' | 'CONTEXTUAL' | 'NONE';
  /** Statements the draft is allowed to make, from verified research. */
  allowedFacts: string[];
  bannedPhrases?: string[];
}): LintFinding[] {
  const findings: LintFinding[] = [];
  const text = `${input.subject}\n${input.body}`;

  const add = (severity: LintFinding['severity'], rule: string, message: string, match: RegExpMatchArray | null) => {
    findings.push({ severity, rule, message, excerpt: excerptAround(text, match?.index ?? 0, match?.[0]?.length ?? 0) });
  };

  // Rule 1: contextual drafts may not claim knowledge. This is a hard block —
  // the whole justification for the contextual path is that it stays honest.
  if (input.tier !== 'VERIFIED') {
    for (const rule of KNOWLEDGE_CLAIMS) {
      const match = text.match(rule.pattern);
      if (match) add('block', rule.rule, rule.message, match);
    }
  }

  // Rule 2: risky specifics. Blocked on contextual; a warning on verified,
  // where the reviewer can check the claim against the fact ledger.
  for (const rule of RISKY_SPECIFICS) {
    const match = text.match(rule.pattern);
    if (!match) continue;
    const supported = input.allowedFacts.some((f) =>
      f.toLowerCase().includes(match[0].toLowerCase().trim()),
    );
    if (supported) continue;
    add(input.tier === 'VERIFIED' ? 'warn' : 'block', rule.rule, rule.message, match);
  }

  // Rule 3: template tells, always advisory.
  for (const tell of MASS_MAIL_TELLS) {
    const match = text.match(tell.pattern);
    if (match) add('warn', 'mass-mail-tell', tell.message, match);
  }

  for (const phrase of input.bannedPhrases ?? []) {
    const idx = text.toLowerCase().indexOf(phrase.toLowerCase());
    if (idx !== -1) {
      findings.push({
        severity: 'block', rule: 'banned-phrase',
        message: `Contains a phrase you asked never to use: "${phrase}"`,
        excerpt: excerptAround(text, idx, phrase.length),
      });
    }
  }

  // Length is a proxy for effort. Long cold emails do not get read.
  const words = input.body.trim().split(/\s+/).length;
  if (words > 170) {
    findings.push({ severity: 'warn', rule: 'too-long', message: `${words} words. Aim for under 140.`, excerpt: '' });
  }

  return findings;
}

export function hasBlockers(findings: LintFinding[]) {
  return findings.some((f) => f.severity === 'block');
}

function excerptAround(text: string, index: number, length: number) {
  return text.slice(Math.max(0, index - 40), index + length + 40).replace(/\s+/g, ' ').trim();
}
