import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
const { normalizePhone, normalizeSuppressionValue } = await import('../suppression');

describe('normalizePhone', () => {
  it('reduces North American numbers to ten digits', () => {
    expect(normalizePhone('(416) 555-0101')).toBe('4165550101');
    expect(normalizePhone('+1 416 555 0101')).toBe('4165550101');
    expect(normalizePhone('1-416-555-0101')).toBe('4165550101');
  });

  it('keeps international numbers and rejects fragments', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('442079460958');
    expect(normalizePhone('ext 12')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe('normalizeSuppressionValue', () => {
  it('lower-cases emails', () => {
    expect(normalizeSuppressionValue('EMAIL', '  Jordan@Example.COM ')).toBe('jordan@example.com');
  });

  it('reduces domains to a bare host', () => {
    expect(normalizeSuppressionValue('DOMAIN', 'https://www.Example.com/contact')).toBe('example.com');
    expect(normalizeSuppressionValue('DOMAIN', '@example.com')).toBe('example.com');
  });

  it('matches phone entries however they were typed', () => {
    expect(normalizeSuppressionValue('PHONE', '+1 (416) 555-0101')).toBe(normalizeSuppressionValue('PHONE', '416.555.0101'));
  });
});
