import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { startOfMonth } from 'date-fns';

export class BudgetExceededError extends Error {
  constructor(public spentCents: number, public capCents: number) {
    super(`AI budget exhausted: ${(spentCents / 100).toFixed(2)} of ${(capCents / 100).toFixed(2)} used this month`);
    this.name = 'BudgetExceededError';
  }
}

/**
 * Checked before every model call. An agency running a large discovery import
 * against an expensive model can burn a month of budget in an afternoon; this
 * turns that into a clear, recoverable error instead of a surprise invoice.
 *
 * The check is advisory-then-hard: over 80% raises a warning surfaced in the
 * UI, over 100% blocks. Blocked jobs stay QUEUED and resume next cycle.
 */
export async function assertBudget(organizationId: string, estimatedCents = 0) {
  const capCents = env().AI_MONTHLY_BUDGET_CENTS;

  const agg = await db.aiRun.aggregate({
    where: { organizationId, createdAt: { gte: startOfMonth(new Date()) } },
    _sum: { costCents: true },
  });
  const spent = agg._sum.costCents ?? 0;

  if (spent + estimatedCents > capCents) throw new BudgetExceededError(spent, capCents);
  return { spentCents: spent, capCents, warning: spent / capCents > 0.8 };
}

export async function monthlySpend(organizationId: string) {
  const [total, byKind] = await Promise.all([
    db.aiRun.aggregate({
      where: { organizationId, createdAt: { gte: startOfMonth(new Date()) } },
      _sum: { costCents: true, tokensIn: true, tokensOut: true },
      _count: true,
    }),
    db.aiRun.groupBy({
      by: ['kind'],
      where: { organizationId, createdAt: { gte: startOfMonth(new Date()) } },
      _sum: { costCents: true },
      _count: true,
    }),
  ]);

  return {
    spentCents: total._sum.costCents ?? 0,
    capCents: env().AI_MONTHLY_BUDGET_CENTS,
    runs: total._count,
    tokensIn: total._sum.tokensIn ?? 0,
    tokensOut: total._sum.tokensOut ?? 0,
    byKind: byKind.map((k) => ({ kind: k.kind, costCents: k._sum.costCents ?? 0, runs: k._count })),
  };
}
