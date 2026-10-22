import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
const { csvCell, csvRow } = await import('../export');

describe('csvCell', () => {
  it('leaves plain values alone and blanks nulls', () => {
    expect(csvCell('Maple Plastics')).toBe('Maple Plastics');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('Smith, Jones')).toBe('"Smith, Jones"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
  });

  it('defuses spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toMatch(/^"'=/);
    expect(csvCell('+1 416')).toBe("'+1 416");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });
});

describe('csvRow', () => {
  it('joins cells', () => {
    expect(csvRow(['a', null, 'b,c'])).toBe('a,,"b,c"');
  });
});
