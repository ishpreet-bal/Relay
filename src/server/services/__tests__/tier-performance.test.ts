import { describe, it, expect } from 'vitest';
import { twoProportionZTest } from '../tier-performance';

describe('twoProportionZTest', () => {
  it('finds no significance in small noisy samples', () => {
    // 1/12 vs 2/15 — the exact case that would fool a naive comparison.
    const { pValue } = twoProportionZTest(2, 15, 1, 12);
    expect(pValue).toBeGreaterThan(0.05);
  });

  it('detects a real gap at adequate volume', () => {
    // 5% vs 0.5% over 400 sends each.
    const { z, pValue } = twoProportionZTest(20, 400, 2, 400);
    expect(z).toBeGreaterThan(0);
    expect(pValue).toBeLessThan(0.05);
  });

  it('reports no significance when rates are identical', () => {
    const { pValue } = twoProportionZTest(20, 400, 20, 400);
    expect(pValue).toBeCloseTo(0.5, 1);
  });

  it('handles empty samples without dividing by zero', () => {
    expect(twoProportionZTest(0, 0, 0, 0)).toEqual({ z: 0, pValue: 1 });
  });
});
