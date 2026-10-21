import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
const { stepsFromPlaybook } = await import('../campaigns');

describe('stepsFromPlaybook', () => {
  it('turns a playbook sequence into campaign steps (Day 1/3/7/14)', () => {
    const steps = stepsFromPlaybook([
      { delayDays: 0, purpose: 'Introduction', instructions: 'Lead with a verified fact.' },
      { delayDays: 2, purpose: 'Follow-up', instructions: 'Short.' },
      { delayDays: 4, purpose: 'Different angle', instructions: 'New proof point.' },
      { delayDays: 7, purpose: 'Breakup', instructions: 'Close the loop.' },
    ]);
    expect(steps.map((s) => s.delayHours)).toEqual([0, 48, 96, 168]);
    expect(steps.map((s) => s.order)).toEqual([0, 1, 2, 3]);
    expect(steps.every((s) => s.stopOnReply)).toBe(true);
  });

  it('skips malformed entries and always sends the first step without delay', () => {
    const steps = stepsFromPlaybook([{ purpose: 'No instructions' }, { delayDays: 5, purpose: 'Intro', instructions: 'Hello.' }, null]);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ order: 0, delayHours: 0, purpose: 'Intro' });
  });

  it('returns nothing for a missing template', () => {
    expect(stepsFromPlaybook(null)).toEqual([]);
    expect(stepsFromPlaybook({})).toEqual([]);
  });
});
