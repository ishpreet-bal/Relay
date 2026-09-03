import type { Lead, Research } from '@prisma/client';

/**
 * Lead scoring, 0-100. Deliberately transparent: every point is attributable to
 * a named signal and surfaced in the UI, because an opaque score is a score
 * nobody trusts or tunes. Weights live here, not in the database, so changes are
 * reviewable in a pull request.
 */
export interface ScoreSignal {
  key: string;
  label: string;
  points: number;
  max: number;
  detail?: string;
}

export interface ScoreResult {
  score: number;
  signals: ScoreSignal[];
}

// Industries where repetitive back-office work is near-universal and buying
// decisions sit with one or two people. Tuned from close-rate data over time.
const HIGH_FIT_INDUSTRIES = new Set([
  'dental', 'medical', 'law', 'accounting', 'hvac', 'electrical', 'plumbing',
  'auto repair', 'car dealership', 'property management', 'insurance',
  'construction', 'manufacturing', 'logistics', 'warehouse', 'engineering',
  'architecture',
]);

// Software whose presence implies data already exists to automate against.
const AUTOMATABLE_STACK = new Set([
  'quickbooks', 'sage', 'xero', 'sharepoint', 'microsoft 365', 'google workspace',
  'salesforce', 'hubspot', 'jobber', 'servicetitan', 'housecall pro', 'dentrix',
  'open dental', 'clio', 'sap', 'netsuite', 'shopify', 'wordpress',
]);

type ScoreInput = Pick<
  Lead,
  'industry' | 'employeeCount' | 'employeeRange' | 'websiteUrl' | 'linkedinUrl' | 'techStack' | 'city' | 'region'
> & {
  hasVerifiedEmail: boolean;
  hasDecisionMaker: boolean;
  research?: Pick<Research, 'opportunities' | 'estimatedAnnualSavingsCents' | 'confidence'> | null;
};

export function scoreLead(input: ScoreInput): ScoreResult {
  const signals: ScoreSignal[] = [];

  // 1. Industry fit — 20
  const industry = input.industry?.toLowerCase().trim() ?? '';
  const industryHit = [...HIGH_FIT_INDUSTRIES].some((i) => industry.includes(i));
  signals.push({
    key: 'industry',
    label: 'Industry fit',
    points: industryHit ? 20 : industry ? 8 : 0,
    max: 20,
    detail: industry || 'Unknown industry',
  });

  // 2. Company size — 20. The sweet spot is 5-50: big enough to feel the pain,
  // small enough that the owner can say yes in one meeting.
  const size = input.employeeCount ?? estimateFromRange(input.employeeRange);
  let sizePoints = 0;
  let sizeDetail = 'Size unknown';
  if (size !== null) {
    sizeDetail = `${size} employees`;
    if (size >= 5 && size <= 50) sizePoints = 20;
    else if (size > 50 && size <= 100) sizePoints = 14;
    else if (size >= 2 && size < 5) sizePoints = 10;
    else sizePoints = 4;
  }
  signals.push({ key: 'size', label: 'Company size', points: sizePoints, max: 20, detail: sizeDetail });

  // 3. Reachability — 25. No verified decision-maker email means no campaign.
  let reach = 0;
  if (input.hasVerifiedEmail) reach += 15;
  if (input.hasDecisionMaker) reach += 10;
  signals.push({
    key: 'reachability',
    label: 'Contact quality',
    points: reach,
    max: 25,
    detail: input.hasVerifiedEmail
      ? input.hasDecisionMaker ? 'Verified decision-maker email' : 'Verified email, role unclear'
      : 'No verified email',
  });

  // 4. Digital footprint — 15. Enough surface area to personalize honestly.
  let footprint = 0;
  if (input.websiteUrl) footprint += 9;
  if (input.linkedinUrl) footprint += 6;
  signals.push({
    key: 'footprint',
    label: 'Research surface',
    points: footprint,
    max: 15,
    detail: input.websiteUrl ? 'Website available to research' : 'No website found',
  });

  // 5. Automatable stack — 10
  const stack = input.techStack.map((t) => t.toLowerCase());
  const matches = stack.filter((t) => [...AUTOMATABLE_STACK].some((a) => t.includes(a)));
  signals.push({
    key: 'stack',
    label: 'Automatable systems',
    points: Math.min(10, matches.length * 5),
    max: 10,
    detail: matches.length ? matches.join(', ') : 'No known systems detected',
  });

  // 6. Researched opportunity — 10. Only awarded once research has actually run,
  // so a fresh lead can never outrank a qualified one on speculation.
  const opps = Array.isArray(input.research?.opportunities) ? input.research!.opportunities.length : 0;
  const confidence = input.research?.confidence ?? 0;
  signals.push({
    key: 'opportunity',
    label: 'Automation opportunity',
    points: Math.round(Math.min(10, opps * 3) * Math.max(confidence, 0.5)),
    max: 10,
    detail: opps ? `${opps} opportunities identified` : 'Not researched yet',
  });

  const score = Math.max(0, Math.min(100, signals.reduce((sum, s) => sum + s.points, 0)));
  return { score, signals };
}

function estimateFromRange(range: string | null): number | null {
  if (!range) return null;
  const parts = range.match(/(\d+)\D+(\d+)/);
  if (parts) return Math.round((Number(parts[1]) + Number(parts[2])) / 2);
  const single = range.match(/(\d+)/);
  return single ? Number(single[1]) : null;
}

export function temperatureFor(score: number) {
  if (score >= 75) return 'HOT' as const;
  if (score >= 50) return 'WARM' as const;
  return 'COLD' as const;
}
