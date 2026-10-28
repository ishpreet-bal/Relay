import { describe, it, expect } from 'vitest';
import { prioritize, type QueueFacts } from '../prioritize';

const NOW = new Date('2026-10-06T15:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400_000);

function facts(overrides: Partial<QueueFacts> = {}): QueueFacts {
  return {
    now: NOW,
    accountScore: 75,
    contactScore: 60,
    accountStatus: 'ACTIVE_OUTREACH',
    hasDirectPhone: true,
    hasAnyPhone: true,
    doNotCall: false,
    contactStatus: 'ACTIVE',
    replies: [],
    emails: [],
    calls: [],
    signals: [],
    upcomingMeeting: false,
    manual: false,
    ...overrides,
  };
}

describe('prioritize', () => {
  it('never queues someone who asked not to be called, or has no number', () => {
    expect(prioritize(facts({ doNotCall: true })).eligible).toBe(false);
    expect(prioritize(facts({ hasAnyPhone: false, hasDirectPhone: false })).eligible).toBe(false);
  });

  it('drops closed accounts and people with a meeting already booked', () => {
    expect(prioritize(facts({ accountStatus: 'DISQUALIFIED' })).eligible).toBe(false);
    expect(prioritize(facts({ upcomingMeeting: true })).eligible).toBe(false);
  });

  it('respects a recent "not interested" for 90 days', () => {
    const recent = prioritize(facts({ calls: [{ at: daysAgo(10), outcome: 'NOT_INTERESTED', callbackAt: null }] }));
    expect(recent.eligible).toBe(false);
    const old = prioritize(facts({ calls: [{ at: daysAgo(120), outcome: 'NOT_INTERESTED', callbackAt: null }] }));
    expect(old.eligible).toBe(true);
  });

  it('does not call someone who replied negatively', () => {
    const d = prioritize(facts({ replies: [{ at: daysAgo(1), replyClass: 'NEGATIVE', snippet: 'Not for us' }] }));
    expect(d.eligible).toBe(false);
  });

  it('puts a due callback first, with a reason the caller can read', () => {
    const d = prioritize(facts({ accountScore: 30, contactScore: 20, calls: [{ at: daysAgo(2), outcome: 'CALL_BACK', callbackAt: daysAgo(0.1) }] }));
    expect(d.eligible).toBe(true);
    if (!d.eligible) return;
    expect(d.category).toBe('CALLBACK_DUE');
    expect(d.reasons[0]!.label).toMatch(/Asked to be called back/);
    expect(d.dueAt).toEqual(daysAgo(0.1));
  });

  it('ranks a positive reply above plain fit and quotes it', () => {
    const replied = prioritize(facts({ replies: [{ at: daysAgo(1), replyClass: 'POSITIVE', snippet: 'Sure, call me Thursday' }] }));
    const fitOnly = prioritize(facts());
    expect(replied.eligible && fitOnly.eligible).toBe(true);
    if (!replied.eligible || !fitOnly.eligible) return;
    expect(replied.category).toBe('REPLIED');
    expect(replied.reasons.some((r) => r.label.includes('Sure, call me Thursday'))).toBe(true);
    expect(replied.priority).toBeGreaterThan(fitOnly.priority);
  });

  it('needs a reason to call: low fit with no engagement is not queued', () => {
    expect(prioritize(facts({ accountScore: 40, contactScore: 30 })).eligible).toBe(false);
    const d = prioritize(facts());
    expect(d.eligible && d.category).toBe('HIGH_FIT');
  });

  it('counts fresh signals but ignores rejected or stale ones', () => {
    const base = { accountScore: 40, contactScore: 30 };
    const fresh = prioritize(facts({ ...base, signals: [{ type: 'HIRING', title: 'Hiring two drivers', at: daysAgo(3), evidenceStatus: 'VERIFIED' }] }));
    expect(fresh.eligible && fresh.category).toBe('SIGNAL');
    const stale = prioritize(facts({ ...base, signals: [{ type: 'HIRING', title: 'Old post', at: daysAgo(90), evidenceStatus: 'VERIFIED' }] }));
    expect(stale.eligible).toBe(false);
    const rejected = prioritize(facts({ ...base, signals: [{ type: 'HIRING', title: 'Wrong', at: daysAgo(3), evidenceStatus: 'REJECTED' }] }));
    expect(rejected.eligible).toBe(false);
  });

  it('spaces out unanswered attempts and rests a contact after six', () => {
    const one = prioritize(facts({ calls: [{ at: daysAgo(0.5), outcome: 'NO_ANSWER', callbackAt: null }] }));
    expect(one.eligible).toBe(true);
    if (one.eligible) {
      expect(one.notBefore).not.toBeNull();
      expect(one.reasons.some((r) => r.code === 'ATTEMPTS' && r.points < 0)).toBe(true);
    }
    const six = Array.from({ length: 6 }, (_, i) => ({ at: daysAgo(3 * (i + 1)), outcome: 'NO_ANSWER' as const, callbackAt: null }));
    expect(prioritize(facts({ calls: six })).eligible).toBe(false);
  });

  it('keeps priority within 0–100', () => {
    const d = prioritize(facts({
      accountScore: 100, contactScore: 100, manual: true,
      replies: [{ at: daysAgo(1), replyClass: 'POSITIVE', snippet: null }],
      emails: [{ sentAt: daysAgo(2), opened: true, clicked: true }],
      signals: [{ type: 'EXPANSION', title: 'New plant', at: daysAgo(1), evidenceStatus: 'VERIFIED' }],
      calls: [{ at: daysAgo(1), outcome: 'CALL_BACK', callbackAt: daysAgo(0.1) }],
    }));
    expect(d.eligible && d.priority).toBe(100);
  });
});

it('keeps a requested future callback out of today’s callable work', () => {
  const requested = new Date(NOW.getTime() + 2 * 86400_000);
  const d = prioritize(facts({ calls: [{ at: daysAgo(1), outcome: 'CALL_BACK', callbackAt: requested }] }));
  expect(d.eligible).toBe(true);
  if (d.eligible) expect(d.notBefore).toEqual(requested);
});
