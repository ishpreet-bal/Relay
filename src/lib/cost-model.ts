/**
 * The arithmetic behind a service package's price: what it costs to build
 * and run, and what that cost implies at a target margin. Plain numbers in,
 * plain numbers out, in cents.
 */

export type PackageCosts = {
  buildHours: number;
  setupCostCents: number;
  hostingCents: number;
  databaseCents: number;
  aiCents: number;
  thirdPartyCents: number;
  domainCents: number;
  monitoringCents: number;
  supportHours: number;
  maintenanceHours: number;
  targetMarginPct: number;
  priceSetupCents?: number | null;
  priceMonthlyCents?: number | null;
};

export type CostBreakdown = {
  setup: { labourCents: number; thirdPartyCents: number; totalCents: number };
  monthly: { infrastructureCents: number; labourCents: number; totalCents: number; lines: { label: string; cents: number }[] };
  /** The lowest price that still earns the target margin. */
  floor: { setupCents: number; monthlyCents: number };
  /** Margin on the quoted prices, when there are any. */
  quoted: { setupMarginPct: number | null; monthlyMarginPct: number | null; belowTarget: boolean };
  firstYear: { costCents: number; floorCents: number; quotedCents: number | null };
};

const atMargin = (cost: number, marginPct: number) => (marginPct >= 100 ? Infinity : Math.ceil(cost / (1 - marginPct / 100)));
const marginOf = (price: number | null | undefined, cost: number) => (price && price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : null);

export function costBreakdown(p: PackageCosts, hourlyCostCents: number): CostBreakdown {
  const setupLabour = Math.round(p.buildHours * hourlyCostCents);
  const setupTotal = setupLabour + p.setupCostCents;
  const lines = [
    { label: 'Hosting', cents: p.hostingCents },
    { label: 'Database', cents: p.databaseCents },
    { label: 'AI services', cents: p.aiCents },
    { label: 'Third-party services', cents: p.thirdPartyCents },
    { label: 'Domain, email and website upkeep', cents: p.domainCents },
    { label: 'Monitoring', cents: p.monitoringCents },
    { label: 'Support time', cents: Math.round(p.supportHours * hourlyCostCents) },
    { label: 'Maintenance time', cents: Math.round(p.maintenanceHours * hourlyCostCents) },
  ];
  const infrastructure = p.hostingCents + p.databaseCents + p.aiCents + p.thirdPartyCents + p.domainCents + p.monitoringCents;
  const monthlyLabour = Math.round((p.supportHours + p.maintenanceHours) * hourlyCostCents);
  const monthlyTotal = infrastructure + monthlyLabour;
  const floorSetup = atMargin(setupTotal, p.targetMarginPct);
  const floorMonthly = atMargin(monthlyTotal, p.targetMarginPct);
  const setupMargin = marginOf(p.priceSetupCents, setupTotal);
  const monthlyMargin = marginOf(p.priceMonthlyCents, monthlyTotal);
  const quotedYear = p.priceSetupCents != null || p.priceMonthlyCents != null ? (p.priceSetupCents ?? 0) + 12 * (p.priceMonthlyCents ?? 0) : null;
  return {
    setup: { labourCents: setupLabour, thirdPartyCents: p.setupCostCents, totalCents: setupTotal },
    monthly: { infrastructureCents: infrastructure, labourCents: monthlyLabour, totalCents: monthlyTotal, lines },
    floor: { setupCents: floorSetup, monthlyCents: floorMonthly },
    quoted: {
      setupMarginPct: setupMargin,
      monthlyMarginPct: monthlyMargin,
      belowTarget: [setupMargin, monthlyMargin].some((m) => m != null && m < p.targetMarginPct),
    },
    firstYear: { costCents: setupTotal + 12 * monthlyTotal, floorCents: floorSetup + 12 * floorMonthly, quotedCents: quotedYear },
  };
}
