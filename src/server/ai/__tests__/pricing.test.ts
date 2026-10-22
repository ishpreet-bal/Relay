import { describe, it, expect } from 'vitest';
import { MODELS, PRICING, costCents, costMillicents } from '../pricing';

describe('AI pricing', () => {
  it('prices every model the app routes to', () => {
    for (const model of Object.values(MODELS)) expect(PRICING[model], model).toBeDefined();
  });

  it('computes cost from per-million-token prices', () => {
    // Sonnet 5: $2 in / $10 out per million tokens.
    expect(costMillicents('claude-sonnet-5', 1_000_000, 100_000)).toBe(300_000); // $3.00
    expect(costCents('claude-sonnet-5', 1_000_000, 100_000)).toBe(300);
  });

  it('applies the long-prompt rate above the threshold', () => {
    expect(costMillicents('claude-haiku-5-5', 100_000, 0)).toBe(1_000); // $0.01 at $0.10/M
    expect(costMillicents('claude-haiku-5-5', 200_000, 0)).toBe(10_000); // $0.10 at $0.50/M
  });

  it('rounds cents up so spend is never under-reported', () => {
    expect(costCents('claude-haiku-5-5', 10, 10)).toBe(1);
    expect(costCents('unknown-model', 1000, 1000)).toBe(0);
  });
});
