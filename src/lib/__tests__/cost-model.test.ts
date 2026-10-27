import { describe, expect, it } from 'vitest';
import { costBreakdown, type PackageCosts } from '../cost-model';

const base: PackageCosts = {
  buildHours: 10, setupCostCents: 5000, hostingCents: 1000, databaseCents: 500, aiCents: 2000, thirdPartyCents: 0,
  domainCents: 300, monitoringCents: 200, supportHours: 1, maintenanceHours: 2, targetMarginPct: 40,
};

describe('package cost model', () => {
  it('adds up labour and running costs at the internal hourly cost', () => {
    const c = costBreakdown(base, 6000);
    expect(c.setup).toEqual({ labourCents: 60_000, thirdPartyCents: 5000, totalCents: 65_000 });
    expect(c.monthly.infrastructureCents).toBe(4000);
    expect(c.monthly.labourCents).toBe(18_000);
    expect(c.monthly.totalCents).toBe(22_000);
    expect(c.monthly.lines.reduce((s, l) => s + l.cents, 0)).toBe(c.monthly.totalCents);
  });

  it('prices the floor so the target margin is earned', () => {
    const c = costBreakdown(base, 6000);
    expect(c.floor.monthlyCents).toBe(Math.ceil(22_000 / 0.6));
    expect((c.floor.monthlyCents - c.monthly.totalCents) / c.floor.monthlyCents).toBeGreaterThanOrEqual(0.4);
    expect(c.firstYear.costCents).toBe(65_000 + 12 * 22_000);
  });

  it('shows the margin on quoted prices and flags quotes below target', () => {
    const ok = costBreakdown({ ...base, priceSetupCents: 130_000, priceMonthlyCents: 44_000 }, 6000);
    expect(ok.quoted).toEqual({ setupMarginPct: 50, monthlyMarginPct: 50, belowTarget: false });
    const low = costBreakdown({ ...base, priceMonthlyCents: 25_000 }, 6000);
    expect(low.quoted.monthlyMarginPct).toBe(12);
    expect(low.quoted.belowTarget).toBe(true);
    expect(costBreakdown(base, 6000).quoted).toEqual({ setupMarginPct: null, monthlyMarginPct: null, belowTarget: false });
  });
});
