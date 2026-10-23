import { describe, it, expect, vi } from 'vitest';
import type { PipelineSettings } from '@prisma/client';
import type { AccountScore } from '@/server/services/scoring/types';

vi.mock('@/lib/db', () => ({ db: {} }));
const { refreshDue, screenAccount, stageAfterScreening } = await import('../screening');
const { roiScenarios, validateDeepOutput } = await import('../deep');
const { forecast, standardForecasts, assumptionsFrom, DEFAULT_COST_ASSUMPTIONS } = await import('../forecast');

const score = (fit: number, signals: number, data: number, flags: string[] = []): AccountScore => ({
  version: 2, total: 0, flags, summary: '',
  components: [
    { key: 'fit', label: 'Fit', points: fit, max: 40, reasons: [] },
    { key: 'signals', label: 'Signals', points: signals, max: 20, reasons: [] },
    { key: 'data', label: 'Data', points: data, max: 10, reasons: [] },
  ],
});
const base = {
  score: score(36, 10, 8), hasWebsite: true, websiteConfirmed: true, employeeCount: 40, locations: 1, hasPhone: true, contacts: 1,
  signals: [{ type: 'HIRING' as const, eventDate: null, detectedAt: new Date() }], doNotContact: false, now: new Date(),
};
const settings = { screeningThreshold: 55 };

describe('screenAccount', () => {
  it('qualifies a good fit with recent activity and a website', () => {
    const r = screenAccount(base, settings);
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r).toMatchObject({ tier: 'HOT', advance: true });
    expect(r.reasons.map((x) => x.label)).toContain('Website confirmed');
  });

  it('screens out a poor fit with no website, explaining why', () => {
    const r = screenAccount({ ...base, score: score(5, 0, 2), hasWebsite: false, websiteConfirmed: false, signals: [], employeeCount: null, hasPhone: false, contacts: 0 }, settings);
    expect(r.advance).toBe(false);
    expect(r.tier).toBe('LOW');
    expect(r.reasons.find((x) => x.label.startsWith('No website'))?.tone).toBe('negative');
  });

  it('ignores events older than six months', () => {
    const old = screenAccount({ ...base, signals: [{ type: 'HIRING', eventDate: new Date('2020-01-01'), detectedAt: new Date('2020-01-01') }] }, settings);
    expect(old.score).toBeLessThan(screenAccount(base, settings).score);
  });

  it('suppresses do-not-contact and excluded industries whatever the score', () => {
    expect(screenAccount({ ...base, doNotContact: true }, settings)).toMatchObject({ tier: 'SUPPRESSED', advance: false });
    expect(screenAccount({ ...base, score: score(40, 20, 10, ['Excluded industry']) }, settings)).toMatchObject({ tier: 'SUPPRESSED', advance: false });
  });

  it('uses the configured threshold', () => {
    const middling = { ...base, score: score(20, 0, 5), signals: [] };
    const r = screenAccount(middling, settings);
    expect(screenAccount(middling, { screeningThreshold: r.score }).advance).toBe(true);
    expect(screenAccount(middling, { screeningThreshold: r.score + 1 }).advance).toBe(false);
  });
});

describe('stageAfterScreening', () => {
  it('moves between screened states only', () => {
    expect(stageAfterScreening('DISCOVERED', false, true)).toBe('QUALIFIED');
    expect(stageAfterScreening('QUALIFIED', false, false)).toBe('SCREENED_OUT');
    expect(stageAfterScreening('SCREENED_OUT', false, true)).toBe('QUALIFIED');
  });

  it('never undoes research or a person\'s choice', () => {
    expect(stageAfterScreening('ANALYZED', false, false)).toBe('ANALYZED');
    expect(stageAfterScreening('DEEP_RESEARCHED', false, false)).toBe('DEEP_RESEARCHED');
    expect(stageAfterScreening('QUALIFIED', true, false)).toBe('QUALIFIED');
  });
});

describe('refreshDue', () => {
  const s = { refreshDaysHot: 14, refreshDaysWarm: 30, refreshDaysExploratory: 60, refreshDaysLow: 120, refreshDaysScreenedOut: 180 } as PipelineSettings;
  const from = new Date('2026-10-01T00:00:00Z');
  it('checks better prospects more often', () => {
    expect(refreshDue('HOT', 'ANALYZED', s, from).toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(refreshDue('LOW', 'QUALIFIED', s, from).toISOString()).toBe('2027-01-29T00:00:00.000Z');
    expect(refreshDue('WARM', 'SCREENED_OUT', s, from).toISOString()).toBe('2027-03-30T00:00:00.000Z');
  });
});

describe('validateDeepOutput', () => {
  const raw = {
    businessModel: { description: 'Job shop', evidenceFactIds: ['r1', 'x9'] },
    processes: [{ name: 'Quoting', description: 'By email', evidenceFactIds: ['r2'] }, { name: 'Payroll', description: 'Guess', evidenceFactIds: [] }],
    opportunities: [
      { title: 'Quote intake', problem: 'Manual', proposedAutomation: 'Form to job board', evidenceFactIds: ['r2'], howToValidate: 'Ask', estimatedHours: { lowPerWeek: 6, highPerWeek: 3 }, assumptions: ['10 quotes a week'], integrationBarriers: [], matchingSolutionSlugs: ['quote-intake', 'made-up'], confidence: 1.4 },
      { title: 'Invented', problem: 'x', proposedAutomation: 'y', evidenceFactIds: ['f99'], howToValidate: 'z', estimatedHours: null, assumptions: [], integrationBarriers: [], matchingSolutionSlugs: [], confidence: 0.9 },
    ],
    unknowns: [{ question: 'What ERP?', whyItMatters: 'Integration' }],
    contactStrategy: { angle: 'Hiring a scheduler', evidenceFactIds: ['nope'], channel: 'email', caution: '' },
    overallFit: { score: 140, rationale: 'Strong' },
  };

  it('keeps only claims backed by real facts and known solutions', () => {
    const v = validateDeepOutput(raw, new Set(['r1', 'r2']), new Set(['quote-intake']));
    expect(v.businessModel.evidenceFactIds).toEqual(['r1']);
    expect(v.processes.map((p) => p.name)).toEqual(['Quoting']);
    expect(v.opportunities).toHaveLength(1);
    expect(v.opportunities[0]).toMatchObject({ kind: 'AI_HYPOTHESIS', matchingSolutionSlugs: ['quote-intake'], confidence: 1, estimatedHours: { lowPerWeek: 3, highPerWeek: 3 } });
    expect(v.contactStrategy).toBeNull();
    expect(v.overallFit.score).toBe(100);
    expect(v.rejected).toEqual(['process: Payroll', 'opportunity: Invented', 'contact strategy']);
  });

  it('rejects output that does not match the schema', () => {
    expect(() => validateDeepOutput({ nope: true }, new Set(), new Set())).toThrow();
  });

  it('keeps a fit for each of our offers, and a strong or possible fit only with evidence', () => {
    const offers = ['AI Lead Generation & Customer Acquisition', 'Custom AI & Business Process Automation'];
    const v = validateDeepOutput({
      ...raw,
      serviceFit: [
        { offer: 'custom ai & business process automation', fit: 'strong', rationale: 'Quotes arrive by email (observed); retyping them is an inference.', evidenceFactIds: ['r2', 'zz'], proposal: 'A quote intake form that creates job cards.' },
        { offer: 'AI Lead Generation & Customer Acquisition', fit: 'possible', rationale: 'Guess', evidenceFactIds: [], proposal: 'Prospecting' },
        { offer: 'Payroll outsourcing', fit: 'strong', rationale: 'Not something we sell', evidenceFactIds: ['r1'], proposal: 'x' },
        { offer: offers[0], fit: 'none', rationale: 'Sells only to consumers.', evidenceFactIds: [], proposal: 'should be dropped' },
      ],
    }, new Set(['r1', 'r2']), new Set(), offers);
    expect(v.serviceFit).toEqual([
      expect.objectContaining({ offer: offers[1], fit: 'strong', evidenceFactIds: ['r2'], kind: 'AI_HYPOTHESIS' }),
      expect.objectContaining({ offer: offers[0], fit: 'none', proposal: '' }),
    ]);
    expect(v.rejected).toContain(`service fit: ${offers[0]}`);
  });
});

describe('roiScenarios', () => {
  it('computes a low and high scenario from stated assumptions', () => {
    const r = roiScenarios([{ title: 'Quote intake', confidence: 0.8, estimatedHours: { lowPerWeek: 2, highPerWeek: 5 } }])!;
    expect(r.kind).toBe('SCENARIO');
    expect(r.high.annualSavingsCents).toBeGreaterThan(r.low.annualSavingsCents);
    expect(r.note).toMatch(/not a measured result/);
  });

  it('has nothing to say without estimates', () => {
    expect(roiScenarios([{ title: 'x', confidence: 1, estimatedHours: null }])).toBeNull();
  });
});

describe('forecast', () => {
  it('charges discovery only beyond the free allowance', () => {
    const f = forecast({ storedCompanies: 10_000, discoveredPerMonth: 10_000, refreshedPerMonth: 0, analysedPerMonth: 0, deepPerMonth: 0 });
    expect(f.lines.find((l) => l.label === 'Discovery')!.usd).toBe(0);
  });

  it('adds up analysis and deep research at the assumed unit costs', () => {
    const f = forecast({ storedCompanies: 0, discoveredPerMonth: 0, refreshedPerMonth: 0, analysedPerMonth: 100, deepPerMonth: 10 }, { ...DEFAULT_COST_ASSUMPTIONS, fixedMonthlyUsd: 0 });
    expect(f.lines.find((l) => l.label === 'AI analysis')!.usd).toBe(8.5);
    expect(f.lines.find((l) => l.label === 'Deep research + contacts')!.usd).toBe(2.82);
    expect(f.totalUsd).toBe(11.32);
  });

  it('covers 1k to 1M stored companies without assuming every record is researched', () => {
    const table = standardForecasts();
    expect(table.map((t) => t.scenario.storedCompanies)).toEqual([1_000, 10_000, 100_000, 1_000_000]);
    expect(table[3]!.scenario.analysedPerMonth).toBe(20_000);
    expect(table[3]!.totalUsd).toBeGreaterThan(table[0]!.totalUsd);
  });

  it('reads saved assumptions defensively', () => {
    expect(assumptionsFrom({ analysisPerCompanyUsd: 0.05, deepPerCompanyUsd: -1, bogus: 3 }).analysisPerCompanyUsd).toBe(0.05);
    expect(assumptionsFrom(null).deepPerCompanyUsd).toBe(DEFAULT_COST_ASSUMPTIONS.deepPerCompanyUsd);
    expect(assumptionsFrom({ deepPerCompanyUsd: -1 }).deepPerCompanyUsd).toBe(DEFAULT_COST_ASSUMPTIONS.deepPerCompanyUsd);
  });
});
