import { db } from '@/lib/db';
import { subDays, subMonths, startOfMonth, format } from 'date-fns';

/**
 * Agency-level reporting.
 *
 * Two rules shape this file. First, conversion is measured against a cohort
 * that has had time to convert — counting this week's leads in a conversion
 * rate makes every rate look terrible and every improvement invisible. Second,
 * revenue comes from accepted proposals and paid invoices, never from pipeline
 * value, because pipeline is a hope and revenue is a fact.
 */

export interface PipelineStage { status: string; count: number; valueCents: number }

export async function pipelineSnapshot(organizationId: string) {
  const [stages, byIndustry] = await Promise.all([
    db.lead.groupBy({
      by: ['status'],
      where: { organizationId, deletedAt: null },
      _count: true,
      _sum: { estimatedValueCents: true },
    }),
    db.lead.groupBy({
      by: ['industry'],
      where: { organizationId, deletedAt: null, industry: { not: null } },
      _count: true,
      orderBy: { _count: { industry: 'desc' } },
      take: 8,
    }),
  ]);

  return {
    stages: stages.map((s) => ({
      status: s.status,
      count: s._count,
      valueCents: s._sum.estimatedValueCents ?? 0,
    })),
    byIndustry: byIndustry.map((i) => ({ industry: i.industry!, count: i._count })),
  };
}

/**
 * Outreach performance over a window. Rates are computed against delivered
 * mail, not sent — bounced mail never had a chance to be replied to, and
 * including it flatters the numbers.
 */
export async function outreachPerformance(organizationId: string, days = 90) {
  const since = subDays(new Date(), days);

  const grouped = await db.message.groupBy({
    by: ['status'],
    where: { organizationId, direction: 'OUTBOUND', sentAt: { gte: since } },
    _count: true,
  });

  const of = (statuses: string[]) =>
    grouped.filter((g) => statuses.includes(g.status)).reduce((n, g) => n + g._count, 0);

  const sent = of(['SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED', 'COMPLAINED']);
  const delivered = of(['DELIVERED', 'OPENED', 'CLICKED', 'REPLIED']);
  const replied = of(['REPLIED']);

  const meetings = await db.meeting.count({
    where: { organizationId, createdAt: { gte: since } },
  });

  return {
    sent,
    delivered,
    opened: of(['OPENED', 'CLICKED', 'REPLIED']),
    replied,
    bounced: of(['BOUNCED']),
    complained: of(['COMPLAINED']),
    meetings,
    replyRate: delivered ? replied / delivered : 0,
    bounceRate: sent ? of(['BOUNCED']) / sent : 0,
    meetingRate: replied ? meetings / replied : 0,
  };
}

/**
 * Conversion measured on a matured cohort. Leads added inside the maturation
 * window are excluded — they have not had time to close, and including them
 * makes the rate move for reasons that have nothing to do with performance.
 */
export async function conversionRate(organizationId: string, maturationDays = 60) {
  const cutoff = subDays(new Date(), maturationDays);

  const [cohort, won, contacted] = await Promise.all([
    db.lead.count({ where: { organizationId, deletedAt: null, createdAt: { lte: cutoff } } }),
    db.lead.count({ where: { organizationId, deletedAt: null, createdAt: { lte: cutoff }, status: 'WON' } }),
    db.lead.count({
      where: {
        organizationId, deletedAt: null, createdAt: { lte: cutoff },
        status: { in: ['CONTACTED', 'ENGAGED', 'MEETING_BOOKED', 'PROPOSAL_SENT', 'WON', 'LOST'] },
      },
    }),
  ]);

  return {
    cohortSize: cohort,
    contacted,
    won,
    maturationDays,
    leadToWon: cohort ? won / cohort : 0,
    contactedToWon: contacted ? won / contacted : 0,
    // Below this the rate is noise, and the UI should say so instead of
    // rendering a confident-looking percentage.
    reliable: cohort >= 30,
  };
}

export async function revenueSummary(organizationId: string, months = 6) {
  const since = startOfMonth(subMonths(new Date(), months - 1));

  const [accepted, invoices, org] = await Promise.all([
    db.proposal.findMany({
      where: { organizationId, status: 'ACCEPTED', acceptedAt: { gte: since } },
      select: { acceptedAt: true, totalCents: true, recurringMonthlyCents: true },
    }),
    db.invoice.findMany({
      where: { organizationId, createdAt: { gte: since } },
      select: { status: true, amountCents: true, paidAt: true, dueAt: true, createdAt: true },
    }),
    db.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { currency: true },
    }),
  ]);

  const buckets = new Map<string, { month: string; won: number; collected: number }>();
  for (let i = months - 1; i >= 0; i--) {
    const key = format(subMonths(new Date(), i), 'yyyy-MM');
    buckets.set(key, { month: format(subMonths(new Date(), i), 'MMM'), won: 0, collected: 0 });
  }

  for (const p of accepted) {
    if (!p.acceptedAt) continue;
    const bucket = buckets.get(format(p.acceptedAt, 'yyyy-MM'));
    if (bucket) bucket.won += p.totalCents;
  }
  for (const inv of invoices) {
    if (inv.status !== 'paid' || !inv.paidAt) continue;
    const bucket = buckets.get(format(inv.paidAt, 'yyyy-MM'));
    if (bucket) bucket.collected += inv.amountCents;
  }

  const outstanding = invoices
    .filter((i) => i.status === 'open')
    .reduce((sum, i) => sum + i.amountCents, 0);
  const overdue = invoices
    .filter((i) => i.status === 'open' && i.dueAt && i.dueAt < new Date())
    .reduce((sum, i) => sum + i.amountCents, 0);

  // MRR from active recurring lines on accepted proposals. This is contracted
  // recurring revenue, not an annualized projection of one good month.
  const mrrCents = accepted.reduce((sum, p) => sum + p.recurringMonthlyCents, 0);

  return {
    currency: org.currency,
    series: [...buckets.values()],
    mrrCents,
    outstandingCents: outstanding,
    overdueCents: overdue,
    wonThisMonthCents: [...buckets.values()].at(-1)?.won ?? 0,
  };
}

export async function activeProjects(organizationId: string) {
  return db.proposal.findMany({
    where: { organizationId, status: 'ACCEPTED' },
    orderBy: { acceptedAt: 'desc' },
    take: 20,
    include: { lead: { select: { id: true, companyName: true } } },
  });
}
