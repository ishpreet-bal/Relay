/**
 * Solution matching and reusability, deterministic and explained.
 *
 * An opportunity is compared with every template in the catalogue on the
 * words that describe the work (use cases, name, description) and on
 * industry. The best match decides how much can be reused:
 *
 *   EXACT          the template covers it; only branding and rule values change
 *   CONFIGURATION  the template plus this customer's settings, fields or connections
 *   MODERATE       the template is the base, with some new modules or integration work
 *   CUSTOM         little to reuse; a build from scratch
 *   NOT_FEASIBLE   a person decided it can't be done (never set automatically)
 *
 * Effort is the template's build estimate scaled by how much is reused,
 * calibrated by finished projects when there are any. Every number carries
 * the reasons and assumptions that produced it, and a person can override
 * the match and the class.
 */

export type Reusability = 'EXACT' | 'CONFIGURATION' | 'MODERATE' | 'CUSTOM' | 'NOT_FEASIBLE';

export interface CatalogueTemplate {
  id: string;
  slug: string;
  name: string;
  industry: string;
  description: string;
  useCases: string[];
  buildHoursEstimate: number | null;
  latestVersionId: string | null;
  /** Integrations the template declares; connecting them is extra work. */
  integrations: number;
}

export interface OpportunityText {
  title: string;
  problem: string;
  proposedAutomation: string;
  integrationBarriers: string[];
  industry: string | null;
}

const STOP = new Set(('a an and are as at be by for from has have in into is it its of on or that the their this to was were will with your our we they them which who how what when where can could would should may might more most less than then so such each per via using use used manual manually process processes automation automate automated automatically system systems data team staff time work').split(' '));

/** Lower-case word stems, without stop words, for overlap scoring. */
export function terms(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP.has(raw)) continue;
    // Crude stemming is enough to match "quotes"/"quoting"/"quote".
    const stem = raw.replace(/(ings|ing|ions|ion|ies|es|s|ed)$/, '');
    out.add(stem.length >= 3 ? stem : raw);
  }
  return out;
}

export interface TemplateScore {
  template: CatalogueTemplate;
  score: number;
  matchedTerms: string[];
  industryMatch: boolean;
}

/**
 * Score in [0, 1]: the share of the template's use-case terms the
 * opportunity mentions (weighted most), overlap with its name and
 * description, and a bonus for the same industry.
 */
export function scoreTemplate(opp: OpportunityText, t: CatalogueTemplate): TemplateScore {
  const oppTerms = terms(`${opp.title} ${opp.problem} ${opp.proposedAutomation}`);
  const useCaseTerms = terms(t.useCases.join(' '));
  const otherTerms = terms(`${t.name} ${t.description}`);
  const hits = (set: Set<string>) => [...set].filter((x) => oppTerms.has(x));
  const useCaseHits = hits(useCaseTerms);
  const otherHits = hits(otherTerms).filter((x) => !useCaseTerms.has(x));
  const useCaseShare = useCaseTerms.size ? useCaseHits.length / useCaseTerms.size : 0;
  const otherShare = otherTerms.size ? otherHits.length / Math.min(otherTerms.size, 12) : 0;
  const industryMatch = !!opp.industry && sameIndustry(opp.industry, t.industry);
  const score = Math.min(1, 0.6 * Math.min(1, useCaseShare * 2) + 0.25 * Math.min(1, otherShare) + (industryMatch ? 0.15 : 0));
  return { template: t, score: Math.round(score * 100) / 100, matchedTerms: [...useCaseHits, ...otherHits].slice(0, 12), industryMatch };
}

function sameIndustry(a: string, b: string) {
  const x = terms(a);
  return [...terms(b)].some((w) => x.has(w));
}

export function bestMatch(opp: OpportunityText, catalogue: CatalogueTemplate[]): TemplateScore | null {
  const scored = catalogue.map((t) => scoreTemplate(opp, t)).sort((a, b) => b.score - a.score);
  return scored[0] && scored[0].score > 0 ? scored[0] : null;
}

export function classify(match: TemplateScore | null, barriers: string[]): { reusability: Exclude<Reusability, 'NOT_FEASIBLE'>; reasons: string[] } {
  const reasons: string[] = [];
  if (!match || match.score < 0.25) {
    reasons.push(match ? `Closest template "${match.template.name}" scores ${match.score}; too little in common to reuse.` : 'No template in the catalogue matches.');
    return { reusability: 'CUSTOM', reasons };
  }
  reasons.push(`Best match "${match.template.name}" scores ${match.score}${match.matchedTerms.length ? ` on: ${match.matchedTerms.join(', ')}` : ''}.`);
  if (match.industryMatch) reasons.push(`Same industry (${match.template.industry}).`);
  if (barriers.length) reasons.push(`Integration barriers: ${barriers.join('; ')}.`);
  let reusability: Exclude<Reusability, 'NOT_FEASIBLE'>;
  if (match.score >= 0.7 && barriers.length === 0) reusability = 'EXACT';
  else if (match.score >= 0.45 && barriers.length <= 1) reusability = 'CONFIGURATION';
  else reusability = 'MODERATE';
  if (reusability !== 'EXACT' && match.template.integrations > 0) reasons.push('The template\'s integrations need this customer\'s connections.');
  return { reusability, reasons };
}

/** Share of a from-scratch build each class still needs. */
export const REUSE_FACTOR: Record<Exclude<Reusability, 'NOT_FEASIBLE'>, number> = { EXACT: 0.15, CONFIGURATION: 0.35, MODERATE: 0.65, CUSTOM: 1 };
/** From-scratch estimate when no template gives one. */
export const DEFAULT_SCRATCH_HOURS = 80;

export interface Calibration {
  /** Finished projects on this template. */
  projects: number;
  /** Mean actual ÷ estimated hours across them. */
  ratio: number;
}

/**
 * Build hours with reuse, the from-scratch hours, and how they were made.
 * With three or more finished projects on the template, the estimate is
 * scaled by how those actually went.
 */
export function estimateEffort(reusability: Exclude<Reusability, 'NOT_FEASIBLE'>, template: CatalogueTemplate | null, calibration: Calibration | null) {
  const fromScratch = template?.buildHoursEstimate ? Math.round(template.buildHoursEstimate * 2.5) : DEFAULT_SCRATCH_HOURS;
  let hours = Math.max(4, Math.round(fromScratch * REUSE_FACTOR[reusability]));
  const basis: string[] = [
    template?.buildHoursEstimate
      ? `From scratch ≈ 2.5 × the template's ${template.buildHoursEstimate} h build estimate = ${fromScratch} h (estimate).`
      : `From scratch: default ${DEFAULT_SCRATCH_HOURS} h (no template estimate).`,
    `${reusability.toLowerCase()} reuse needs about ${Math.round(REUSE_FACTOR[reusability] * 100)}% of that.`,
  ];
  if (calibration && calibration.projects >= 3) {
    hours = Math.max(4, Math.round(hours * calibration.ratio));
    basis.push(`Scaled by ${calibration.ratio.toFixed(2)}, the actual ÷ estimated hours over ${calibration.projects} finished projects on this template.`);
  } else {
    basis.push(calibration?.projects ? `Only ${calibration.projects} finished project(s) on this template; not enough to calibrate yet.` : 'No finished projects on this template yet to calibrate against.');
  }
  return { estimatedBuildHours: hours, fromScratchHours: fromScratch, hoursSaved: Math.max(0, fromScratch - hours), basis };
}
