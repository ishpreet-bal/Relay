import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
const { hasModernRequestSurface } = await import('../provider');

describe('hasModernRequestSurface', () => {
  it('covers models that reject sampling parameters and prefills', () => {
    for (const m of ['claude-sonnet-5', 'claude-sonnet-5-5', 'claude-opus-5', 'claude-opus-5-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-haiku-5-5', 'claude-fable-5-1']) {
      expect(hasModernRequestSurface(m), m).toBe(true);
    }
  });

  it('leaves older models on the classic surface', () => {
    for (const m of ['claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6', 'gpt-4o']) {
      expect(hasModernRequestSurface(m), m).toBe(false);
    }
  });
});
