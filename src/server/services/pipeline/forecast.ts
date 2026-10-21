/**
 * Cost forecasts for the research funnel. Stored records do not drive AI
 * cost; how many are discovered, analysed and deeply researched each month
 * does. Every unit cost is an editable assumption (PipelineSettings
 * .costAssumptions), so the forecast changes when prices or plans do.
 *
 *   monthly = fixed
 *           + discovered × discoveryPerCompany
 *           + refreshed  × refreshPerCompany
 *           + analysed   × analysisPerCompany
 *           + deep       × (deepPerCompany + contactsPerDeep × (emailReveal + verification))
 *           + storage(stored)
 */

export interface CostAssumptions {
  fixedMonthlyUsd: number;
  /** Places Text Search page price ÷ usable results per page. */
  discoveryPerCompanyUsd: number;
  /** Free discovery requests a month (the Places free allowance), as companies. */
  freeDiscoveredPerMonth: number;
  refreshPerCompanyUsd: number;
  analysisPerCompanyUsd: number;
  deepPerCompanyUsd: number;
  contactsPerDeep: number;
  emailRevealUsd: number;
  verificationUsd: number;
  storageKbPerCompany: number;
  /** Database plan's included storage, and price per GB beyond it. */
  includedStorageGb: number;
  storagePerGbUsd: number;
}

export const DEFAULT_COST_ASSUMPTIONS: CostAssumptions = {
  fixedMonthlyUsd: 57, // Vercel Pro 20 + Supabase Pro 25 + worker ~5 + one Workspace seat ~7
  discoveryPerCompanyUsd: 0.035 / 15,
  freeDiscoveredPerMonth: 1_000 * 15,
  refreshPerCompanyUsd: 0, // a website read: our compute only
  analysisPerCompanyUsd: 0.085,
  deepPerCompanyUsd: 0.2,
  contactsPerDeep: 2,
  emailRevealUsd: 0.024,
  verificationUsd: 0.017,
  storageKbPerCompany: 6,
  includedStorageGb: 8,
  storagePerGbUsd: 0.125,
};

export interface ForecastScenario {
  storedCompanies: number;
  discoveredPerMonth: number;
  refreshedPerMonth: number;
  analysedPerMonth: number;
  deepPerMonth: number;
}

export interface Forecast {
  scenario: ForecastScenario;
  lines: Array<{ label: string; usd: number; formula: string }>;
  totalUsd: number;
  storageGb: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function forecast(s: ForecastScenario, a: CostAssumptions = DEFAULT_COST_ASSUMPTIONS): Forecast {
  const billableDiscovered = Math.max(0, s.discoveredPerMonth - a.freeDiscoveredPerMonth);
  const storageGb = (s.storedCompanies * a.storageKbPerCompany) / 1_048_576;
  const perDeep = a.deepPerCompanyUsd + a.contactsPerDeep * (a.emailRevealUsd + a.verificationUsd);
  const lines = [
    { label: 'Platform (fixed)', usd: a.fixedMonthlyUsd, formula: 'hosting, database, worker, inbox' },
    { label: 'Discovery', usd: billableDiscovered * a.discoveryPerCompanyUsd, formula: `${billableDiscovered.toLocaleString()} beyond the free allowance × $${a.discoveryPerCompanyUsd.toFixed(4)}` },
    { label: 'Freshness checks', usd: s.refreshedPerMonth * a.refreshPerCompanyUsd, formula: `${s.refreshedPerMonth.toLocaleString()} × $${a.refreshPerCompanyUsd.toFixed(4)}` },
    { label: 'AI analysis', usd: s.analysedPerMonth * a.analysisPerCompanyUsd, formula: `${s.analysedPerMonth.toLocaleString()} × $${a.analysisPerCompanyUsd.toFixed(3)}` },
    { label: 'Deep research + contacts', usd: s.deepPerMonth * perDeep, formula: `${s.deepPerMonth.toLocaleString()} × $${perDeep.toFixed(3)}` },
    { label: 'Storage beyond plan', usd: Math.max(0, storageGb - a.includedStorageGb) * a.storagePerGbUsd, formula: `${storageGb.toFixed(2)} GB stored, ${a.includedStorageGb} GB included` },
  ].map((l) => ({ ...l, usd: round(l.usd) }));
  return { scenario: s, lines, totalUsd: round(lines.reduce((t, l) => t + l.usd, 0)), storageGb: round(storageGb) };
}

/** The standard table: stored sizes with activity as a share of what's stored. */
export function standardForecasts(a: CostAssumptions = DEFAULT_COST_ASSUMPTIONS, rates = { discovered: 0.1, refreshed: 0.1, analysed: 0.02, deep: 0.002 }) {
  return [1_000, 10_000, 100_000, 1_000_000].map((n) => forecast({
    storedCompanies: n,
    discoveredPerMonth: Math.round(n * rates.discovered),
    refreshedPerMonth: Math.round(n * rates.refreshed),
    analysedPerMonth: Math.round(n * rates.analysed),
    deepPerMonth: Math.round(n * rates.deep),
  }, a));
}

export function assumptionsFrom(value: unknown): CostAssumptions {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<CostAssumptions>;
  const out = { ...DEFAULT_COST_ASSUMPTIONS };
  for (const k of Object.keys(out) as Array<keyof CostAssumptions>) {
    const n = Number(v[k]);
    if (v[k] !== undefined && Number.isFinite(n) && n >= 0) out[k] = n;
  }
  return out;
}
