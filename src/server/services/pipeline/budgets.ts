import { format, startOfMonth } from 'date-fns';
import type { UsageType } from '@prisma/client';
import { db } from '@/lib/db';
import { BudgetExceededError } from '@/server/ai/budget';
import { raiseAlert, resolveAlert } from '@/server/services/alerts';
import { getPipelineSettings } from './settings';

/**
 * Spending limits by category, enforced in the backend before the spend
 * happens. When a nonessential category reaches its limit, work in it stops
 * (queued jobs wait, with the reason recorded) while everything else —
 * the dashboard, outreach already approved, customer workflows — carries on.
 * Administrators get an alert at 50%, 80% and 100%.
 */

export const BUDGET_CATEGORIES = ['discovery', 'analysis', 'deep', 'enrichment', 'outreach'] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<BudgetCategory, string> = {
  discovery: 'Discovery', analysis: 'AI analysis', deep: 'Deep research', enrichment: 'Contact enrichment', outreach: 'Outreach',
};

const CATEGORY_TYPES: Record<BudgetCategory, UsageType[]> = {
  discovery: ['DISCOVERY_REQUEST', 'EXTERNAL_DATA'],
  analysis: ['AI_RESEARCH'],
  deep: ['AI_DEEP_RESEARCH'],
  enrichment: ['ENRICHMENT_REQUEST', 'EMAIL_VERIFICATION', 'PHONE_LOOKUP'],
  outreach: ['AI_PERSONALIZATION', 'AI_VERIFICATION', 'AI_OTHER', 'EMAIL_SENT', 'SMS', 'CALL_MINUTES'],
};

export function categoryOf(type: UsageType): BudgetCategory | null {
  return BUDGET_CATEGORIES.find((c) => CATEGORY_TYPES[c].includes(type)) ?? null;
}

const LIMIT_FIELD = {
  discovery: 'discoveryBudgetCents', analysis: 'analysisBudgetCents', deep: 'deepBudgetCents',
  enrichment: 'enrichmentBudgetCents', outreach: 'outreachBudgetCents',
} as const;

export class CategoryBudgetError extends BudgetExceededError {
  constructor(public category: BudgetCategory | 'global', spentCents: number, capCents: number) {
    super(spentCents, capCents);
    const label = category === 'global' ? 'Monthly' : `${CATEGORY_LABELS[category]}`;
    this.message = `${label} budget reached: ${(spentCents / 100).toFixed(2)} of ${(capCents / 100).toFixed(2)} used this month. Queued work waits until next month or a higher limit.`;
    this.name = 'CategoryBudgetError';
  }
}

export interface BudgetLine {
  category: BudgetCategory | 'global';
  label: string;
  spentMillicents: number;
  limitCents: number | null;
  /** 0–1 of the limit; null without a limit. */
  used: number | null;
  level: 'ok' | 'half' | 'high' | 'reached';
  estimated: boolean;
}

/** This month's spend per category against its limit. */
export async function budgetStatus(organizationId: string, now = new Date()): Promise<BudgetLine[]> {
  const settings = await getPipelineSettings(organizationId);
  const rows = await db.usageRecord.groupBy({
    by: ['type'],
    where: { organizationId, occurredAt: { gte: startOfMonth(now) } },
    _sum: { costMillicents: true },
  });
  const estimates = await db.usageRecord.groupBy({
    by: ['type'],
    where: { organizationId, occurredAt: { gte: startOfMonth(now) }, isEstimate: true },
    _count: true,
  });
  const spentFor = (types: UsageType[]) => rows.filter((r) => types.includes(r.type)).reduce((s, r) => s + (r._sum.costMillicents ?? 0), 0);
  const estimatedFor = (types: UsageType[]) => estimates.some((e) => types.includes(e.type));
  const line = (category: BudgetCategory | 'global', label: string, spent: number, limitCents: number | null, estimated: boolean): BudgetLine => {
    const used = limitCents === null ? null : limitCents === 0 ? (spent > 0 ? 1 : 0) : spent / (limitCents * 1000);
    const level = used === null ? 'ok' : used >= 1 ? 'reached' : used >= 0.8 ? 'high' : used >= 0.5 ? 'half' : 'ok';
    return { category, label, spentMillicents: spent, limitCents, used, level, estimated };
  };
  const all = rows.reduce((s, r) => s + (r._sum.costMillicents ?? 0), 0);
  return [
    line('global', 'All tracked spend', all, settings.globalBudgetCents, estimates.length > 0),
    ...BUDGET_CATEGORIES.map((c) => line(c, CATEGORY_LABELS[c], spentFor(CATEGORY_TYPES[c]), settings[LIMIT_FIELD[c]], estimatedFor(CATEGORY_TYPES[c]))),
  ];
}

/**
 * Throws CategoryBudgetError when spending `estimateMillicents` more in this
 * category (or overall) would exceed its monthly limit. Raises the 50/80/100%
 * alerts as a side effect.
 */
export async function assertCategoryBudget(organizationId: string, category: BudgetCategory, estimateMillicents = 0, now = new Date()) {
  const lines = await budgetStatus(organizationId, now);
  const month = format(now, 'yyyy-MM');
  for (const l of lines.filter((x) => x.category === category || x.category === 'global')) {
    if (l.limitCents === null) continue;
    const key = `budget:${l.category}:${month}`;
    if (l.level === 'half' || l.level === 'high') {
      await raiseAlert({
        organizationId, severity: l.level === 'high' ? 'warning' : 'info', kind: 'BUDGET', dedupeKey: `${key}:${l.level}`,
        title: `${l.label}: ${Math.round((l.used ?? 0) * 100)}% of this month's budget used`,
        detail: `${(l.spentMillicents / 100_000).toFixed(2)} of ${(l.limitCents / 100).toFixed(2)} (US$).`,
      });
    }
    if (l.spentMillicents + estimateMillicents > l.limitCents * 1000) {
      await raiseAlert({
        organizationId, severity: 'critical', kind: 'BUDGET', dedupeKey: `${key}:reached`,
        title: `${l.label}: monthly budget reached; ${l.category === 'global' ? 'optional research' : CATEGORY_LABELS[l.category as BudgetCategory].toLowerCase()} is paused`,
        detail: 'Queued work is kept and resumes next month or when the limit is raised. Customer workflows and the dashboard are not affected.',
      });
      throw new CategoryBudgetError(l.category, Math.round(l.spentMillicents / 1000), l.limitCents);
    }
  }
}

/** Clears budget alerts once a limit is raised above the spend. */
export async function refreshBudgetAlerts(organizationId: string, now = new Date()) {
  const month = format(now, 'yyyy-MM');
  for (const l of await budgetStatus(organizationId, now)) {
    if (l.level !== 'reached') await resolveAlert(organizationId, `budget:${l.category}:${month}:reached`);
  }
}
