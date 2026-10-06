/**
 * Cost accounting. Prices are dollars per million tokens and MUST be verified
 * against the provider's current pricing page before each release — they change,
 * and a stale table silently corrupts every margin number in the admin
 * dashboard. Kept in code rather than the database so a change is reviewable.
 *
 * Last verified: update this date whenever you touch the table.
 */
export const PRICING_LAST_VERIFIED = '2026-01-15';

export interface ModelPricing { inputPerMTok: number; outputPerMTok: number }

export const PRICING: Record<string, ModelPricing> = {
  // Anthropic
  'claude-opus-4-8':          { inputPerMTok: 15.0, outputPerMTok: 75.0 },
  'claude-sonnet-5':          { inputPerMTok: 3.0,  outputPerMTok: 15.0 },
  'claude-haiku-4-5-20251001':{ inputPerMTok: 0.8,  outputPerMTok: 4.0 },
  // OpenAI (fallback only)
  'gpt-4o':                   { inputPerMTok: 2.5,  outputPerMTok: 10.0 },
  'gpt-4o-mini':              { inputPerMTok: 0.15, outputPerMTok: 0.6 },
};

/** Returns cost in whole cents, rounded up — never under-report spend. */
export function costCents(model: string, tokensIn: number, tokensOut: number): number {
  const price = PRICING[model];
  if (!price) {
    console.warn(`No pricing entry for "${model}" — cost recorded as 0. Add it to pricing.ts.`);
    return 0;
  }
  const dollars =
    (tokensIn / 1_000_000) * price.inputPerMTok +
    (tokensOut / 1_000_000) * price.outputPerMTok;
  return Math.ceil(dollars * 100);
}

/** Exact cost in thousandths of a cent, for usage records. */
export function costMillicents(model: string, tokensIn: number, tokensOut: number): number {
  const price = PRICING[model];
  if (!price) return 0;
  return Math.round(((tokensIn / 1_000_000) * price.inputPerMTok + (tokensOut / 1_000_000) * price.outputPerMTok) * 100_000);
}

/**
 * Model roles, so call sites ask for a capability rather than hardcoding a
 * model name. Swapping the research model is a one-line change here.
 */
export const MODELS = {
  /** Long-context reasoning over a whole website. */
  research: 'claude-sonnet-5',
  /** Voice-sensitive drafting. */
  personalize: 'claude-sonnet-5',
  /** Claim extraction and support checks on drafts. */
  verify: 'claude-haiku-4-5-20251001',
  /** Cheap, high-volume classification and extraction. */
  classify: 'claude-haiku-4-5-20251001',
  /** Fallback provider equivalents. */
  fallbackResearch: 'gpt-4o',
  fallbackClassify: 'gpt-4o-mini',
} as const;
