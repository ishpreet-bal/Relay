import { describe, expect, it } from 'vitest';
import { categorize, inquirySchema, splitName } from '../inquiry';
import { consultationSlots, isOfferedSlot, zonedTime } from '../consultation';

describe('inquiry categorization', () => {
  it('uses the visitor’s choice when they made one', () => {
    expect(categorize('AUTOMATION', 'anything')).toEqual({ category: 'AUTOMATION', source: 'visitor' });
    expect(categorize('ACQUISITION', 'anything')).toEqual({ category: 'ACQUISITION', source: 'visitor' });
    expect(categorize('WEBSITES', 'anything')).toEqual({ category: 'WEBSITE', source: 'visitor' });
  });

  it('works out "not sure" from the message, and leaves unclear ones general', () => {
    expect(categorize('NOT_SURE', 'We copy data between spreadsheets manually and the weekly report takes a day.').category).toBe('AUTOMATION');
    expect(categorize('NOT_SURE', 'We need more customers and a steady pipeline of leads.').category).toBe('ACQUISITION');
    expect(categorize('NOT_SURE', 'We just opened and need a website with online booking.').category).toBe('WEBSITE');
    expect(categorize('NOT_SURE', 'Hello, could we have a chat?')).toEqual({ category: 'GENERAL', source: 'inferred' });
  });
});

describe('inquiry validation', () => {
  const ok = { name: 'Dana Smith', company: 'Corner Salon', email: 'Dana@Corner-Salon.ca', service: 'WEBSITES', message: 'We need a website with booking.' };
  it('accepts a complete inquiry and normalizes the email', () => {
    const r = inquirySchema.parse(ok);
    expect(r.email).toBe('dana@corner-salon.ca');
    expect(r.preferredTimes).toEqual([]);
    expect(r.marketingConsent).toBe(false);
  });
  it('explains what is wrong', () => {
    const r = inquirySchema.safeParse({ ...ok, email: 'nope', message: 'hi', phone: 'call me' });
    expect(r.success).toBe(false);
    const fields = new Set(r.error!.issues.map((i) => i.path[0]));
    expect(fields).toEqual(new Set(['email', 'message', 'phone']));
  });
  it('splits a name into first and last', () => {
    expect(splitName('Dana')).toEqual({ firstName: 'Dana', lastName: null });
    expect(splitName('Mary Ann  Lee')).toEqual({ firstName: 'Mary Ann', lastName: 'Lee' });
  });
});

describe('consultation times', () => {
  it('converts Toronto wall-clock time across daylight saving', () => {
    expect(zonedTime(2026, 10, 30, 10, 0).toISOString()).toBe('2026-10-30T14:00:00.000Z'); // EDT
    expect(zonedTime(2026, 11, 2, 10, 0).toISOString()).toBe('2026-11-02T15:00:00.000Z'); // EST
  });

  it('offers weekday business hours only, starting the next business day', () => {
    const friday = new Date('2026-10-23T18:00:00Z');
    const days = consultationSlots(friday);
    expect(days[0]!.key).toBe('2026-10-26'); // Monday
    for (const d of days) {
      const weekday = new Date(`${d.key}T12:00:00Z`).getUTCDay();
      expect([0, 6]).not.toContain(weekday);
      expect(d.slots.length).toBeGreaterThan(0);
    }
    expect(days.flatMap((d) => d.slots).every((s) => isOfferedSlot(s.iso, friday))).toBe(true);
  });

  it('rejects times the form would never offer', () => {
    const now = new Date('2026-10-23T18:00:00Z');
    expect(isOfferedSlot('2026-10-24T14:00:00.000Z', now)).toBe(false); // Saturday
    expect(isOfferedSlot('2026-10-26T16:30:00.000Z', now)).toBe(false); // 12:30, not a slot
    expect(isOfferedSlot('2026-10-23T14:00:00.000Z', now)).toBe(false); // in the past
    expect(isOfferedSlot('2027-01-04T15:00:00.000Z', now)).toBe(false); // too far ahead
    expect(isOfferedSlot('not a date', now)).toBe(false);
  });
});
