import { describe, expect, it } from 'vitest';
import { bestMatch, classify, estimateEffort, scoreTemplate, terms, type CatalogueTemplate } from '../matching';
import { assessmentSchema, projectValue } from '../assessment';
import { syntheticInputs } from '../opportunities';

const tpl = (over: Partial<CatalogueTemplate>): CatalogueTemplate => ({
  id: 't', slug: 's', name: 'Quote request desk', industry: 'Construction', description: 'Captures quote requests and drafts quotes for the estimator.',
  useCases: ['quotation generation', 'project administration'], buildHoursEstimate: 30, latestVersionId: 'v', integrations: 0, ...over,
});
const opp = (text: string, barriers: string[] = [], industry: string | null = 'Construction') => ({ title: text, problem: text, proposedAutomation: text, integrationBarriers: barriers, industry });

describe('matching', () => {
  it('stems and drops filler words', () => {
    expect([...terms('Quoting quotes for the ones we manually process')]).toEqual(['quot', 'ones']);
  });

  it('scores use-case overlap and industry, and picks the best template', () => {
    const quotes = tpl({ id: 'q' });
    const claims = tpl({ id: 'c', name: 'Quality claims tracker', industry: 'Manufacturing', description: 'Logs quality claims.', useCases: ['quality claims tracking', 'warranty analysis'] });
    const o = opp('Quotation generation for incoming quote requests and project administration');
    expect(scoreTemplate(o, quotes).score).toBeGreaterThan(scoreTemplate(o, claims).score);
    expect(bestMatch(o, [claims, quotes])!.template.id).toBe('q');
    expect(bestMatch(opp('Payroll for pilots', [], null), [claims])).toBeNull();
  });

  it('classifies reuse from the score and the barriers, never as not feasible on its own', () => {
    const t = tpl({});
    const m = (score: number) => ({ template: t, score, matchedTerms: [], industryMatch: false });
    expect(classify(m(0.8), []).reusability).toBe('EXACT');
    expect(classify(m(0.8), ['No API']).reusability).toBe('CONFIGURATION');
    expect(classify(m(0.5), ['No API', 'Paper forms']).reusability).toBe('MODERATE');
    expect(classify(m(0.3), []).reusability).toBe('MODERATE');
    expect(classify(m(0.1), []).reusability).toBe('CUSTOM');
    expect(classify(null, []).reusability).toBe('CUSTOM');
  });

  it('estimates effort from the template and calibrates only with enough finished projects', () => {
    const t = tpl({ buildHoursEstimate: 40 });
    const plain = estimateEffort('CONFIGURATION', t, null);
    expect(plain).toMatchObject({ fromScratchHours: 100, estimatedBuildHours: 35, hoursSaved: 65 });
    expect(estimateEffort('CONFIGURATION', t, { projects: 2, ratio: 2 }).estimatedBuildHours).toBe(35);
    expect(estimateEffort('CONFIGURATION', t, { projects: 3, ratio: 1.5 }).estimatedBuildHours).toBe(53);
    expect(estimateEffort('CUSTOM', null, null)).toMatchObject({ fromScratchHours: 80, estimatedBuildHours: 80, hoursSaved: 0 });
  });
});

describe('assessment', () => {
  const a = assessmentSchema.parse({
    tasksPerWeek: { value: 30, source: 'stated_by_prospect' },
    minutesPerTask: { value: 12, source: 'observed' },
    automatableShare: { value: { low: 0.5, high: 0.8 }, source: 'our_assumption' },
    hourlyCostCents: { value: 4000, source: 'stated_by_prospect' },
  });

  it('projects a low and high scenario with payback against the price', () => {
    const p = projectValue(a, { setupCents: 600000, monthlyCents: 40000 });
    expect(p.kind).toBe('PROJECTED');
    expect(p.hoursPerMonthToday).toBe(26);
    expect(p.low.hoursPerMonth).toBe(13);
    expect(p.low.monthlyValueCents).toBe(52000);
    expect(p.low.paybackMonths).toBe(50);
    expect(p.high.monthlyValueCents).toBe(83200);
    expect(p.note).toMatch(/unconfirmed estimates \(automatableShare\)/);
  });

  it('refuses inputs without a source or an inverted range', () => {
    expect(assessmentSchema.safeParse({ ...a, tasksPerWeek: { value: 3 } }).success).toBe(false);
    expect(assessmentSchema.safeParse({ ...a, automatableShare: { value: { low: 0.9, high: 0.2 }, source: 'observed' } }).success).toBe(false);
  });
});

describe('demo inputs', () => {
  it('vary the test input while keeping text visibly synthetic', () => {
    const out = syntheticInputs({ customer: 'Synthetic Auto Parts', quantity: 120, reported_on: '2026-10-01', severity: 'high' }, 3);
    expect(out.map((o) => o.customer)).toEqual(['Synthetic Auto Parts', 'Synthetic Auto Parts 2', 'Synthetic Auto Parts 3']);
    expect(out.map((o) => o.quantity)).toEqual([48, 90, 132]);
    expect(out[2]!.reported_on).toBe('2026-10-03');
    expect(out.every((o) => o.severity === 'high')).toBe(true);
  });
});
