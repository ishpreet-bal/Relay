/**
 * Cost accounting. Prices are dollars per million tokens and MUST be verified
 * against the provider's current pricing page before each release — they change,
 * and a stale table silently corrupts every margin number in the admin
 * dashboard. Kept in code rather than the database so a change is reviewable.
 *
 * Last verified: update this date whenever you touch the table.
 */
export const PRICING_LAST_VERIFIED = '2026-10-21';

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  /** Some models charge more per token once a prompt passes a size threshold. */
  longPrompt?: { aboveInputTokens: number; inputPerMTok: number; outputPerMTok: number };
}

// Anthropic first-party list prices (platform.claude.com pricing page, read
// 2026-10-21). Cache reads and writes are not modelled here; calls that use
// prompt caching are slightly over-reported, never under-reported.
export const PRICING: Record<string, ModelPricing> = {
  // Anthropic, current generation
  'claude-opus-5-5':          { inputPerMTok: 4.0,  outputPerMTok: 20.0 },
  'claude-sonnet-5-5':        { inputPerMTok: 2.0,  outputPerMTok: 10.0 },
  'claude-haiku-5-5':         { inputPerMTok: 0.10, outputPerMTok: 0.50, longPrompt: { aboveInputTokens: 100_000, inputPerMTok: 0.50, outputPerMTok: 2.50 } },
  // Anthropic, models this app has used
  'claude-opus-4-8':          { inputPerMTok: 5.0,  outputPerMTok: 25.0 },
  'claude-sonnet-5':          { inputPerMTok: 2.0,  outputPerMTok: 10.0 },
  'claude-haiku-4-5':         { inputPerMTok: 1.0,  outputPerMTok: 5.0 },
  'claude-haiku-4-5-20251001':{ inputPerMTok: 1.0,  outputPerMTok: 5.0 },
  // OpenAI (fallback only)
  'gpt-4o':                   { inputPerMTok: 2.5,  outputPerMTok: 10.0 },
  'gpt-4o-mini':              { inputPerMTok: 0.15, outputPerMTok: 0.6 },
};

function dollars(price: ModelPricing, tokensIn: number, tokensOut: number) {
  const rate = price.longPrompt && tokensIn > price.longPrompt.aboveInputTokens ? price.longPrompt : price;
  return (tokensIn / 1_000_000) * rate.inputPerMTok + (tokensOut / 1_000_000) * rate.outputPerMTok;
}

/** Returns cost in whole cents, rounded up — never under-report spend. */
export function costCents(model: string, tokensIn: number, tokensOut: number): number {
  const price = PRICING[model];
  if (!price) {
    console.warn(`No pricing entry for "${model}" — cost recorded as 0. Add it to pricing.ts.`);
    return 0;
  }
  return Math.ceil(dollars(price, tokensIn, tokensOut) * 100);
}

/** Exact cost in thousandths of a cent, for usage records. */
export function costMillicents(model: string, tokensIn: number, tokensOut: number): number {
  const price = PRICING[model];
  if (!price) return 0;
  return Math.round(dollars(price, tokensIn, tokensOut) * 100_000);
}

/**
 * Model roles, so call sites ask for a capability rather than hardcoding a
 * model name. Swapping the research model is a one-line change here.
 */
export const MODELS = {
  /**
   * Reading a company's own website and pulling out what it says, every
   * quote checked against the page afterwards. Extraction at volume: the
   * low-cost tier, about a twentieth of Sonnet's price per company.
   */
  research: 'claude-haiku-5-5',
  /** Stage 4: multi-source assessment of high-priority prospects. */
  deepResearch: 'claude-opus-5-5',
  /** Voice-sensitive drafting. */
  personalize: 'claude-sonnet-5',
  /** Claim extraction and support checks on drafts. */
  verify: 'claude-haiku-4-5-20251001',
  /** The in-app assistant: answers questions with read-only tools. */
  assistant: 'claude-sonnet-5',
  /** Cheap, high-volume classification and extraction. */
  classify: 'claude-haiku-4-5-20251001',
  /** Fallback provider equivalents. */
  fallbackResearch: 'gpt-4o',
  fallbackClassify: 'gpt-4o-mini',
} as const;
