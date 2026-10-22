import { endOfMonth, startOfMonth, subMonths } from 'date-fns';
import { db } from '@/lib/db';
import { clientFilter, type AccessContext } from '@/server/access/scope';

/**
 * Recurring revenue and customer profitability from recorded data only:
 * subscriptions, invoices, time logged on delivery projects, and provider
 * costs attributed to the customer. Infrastructure is the template's
 * estimate per live application and is labelled as such. Provider costs are
 * kept in their own currency; nothing is converted at a made-up rate.
 */

const LIVE = ['ACTIVE', 'PAST_DUE'];

/** Monthly recurring revenue at the end of each of the last `months` months, per currency. */
export async function mrrHistory(access: AccessContext, months = 6, now = new Date()) {
  const subs = await db.customerSubscription.findMany({
    where: { ...clientFilter(access), startedAt: { not: null } },
    select: { monthlyCents: true, currency: true, startedAt: true, cancelledAt: true },
  });
  return Array.from({ length: months }, (_, i) => {
    const end = i === months - 1 ? now : endOfMonth(subMonths(now, months - 1 - i));
    const byCurrency: Record<string, number> = {};
    for (const s of subs) {
      if (s.startedAt! <= end && (!s.cancelledAt || s.cancelledAt > end)) byCurrency[s.currency] = (byCurrency[s.currency] ?? 0) + s.monthlyCents;
    }
    return { month: end.toISOString().slice(0, 7), mrrCents: byCurrency };
  });
}

export async function financialSummary(access: AccessContext, month: string, now = new Date()) {
  const start = startOfMonth(new Date(`${month}-01T00:00:00Z`));
  const end = endOfMonth(start);
  const scope = clientFilter(access);
  const [subs, invoices, outstanding, churned] = await Promise.all([
    db.customerSubscription.findMany({ where: { ...scope, status: { in: LIVE } }, select: { clientId: true, monthlyCents: true, currency: true, applicationId: true } }),
    db.customerInvoice.findMany({ where: { ...scope, issuedAt: { gte: start, lte: end }, status: { notIn: ['VOID', 'DRAFT'] } }, select: { clientId: true, totalCents: true, currency: true, status: true } }),
    db.customerInvoice.findMany({ where: { ...scope, status: 'OPEN' }, select: { totalCents: true, currency: true, dueAt: true } }),
    db.customerSubscription.count({ where: { ...scope, status: 'CANCELLED', cancelledAt: { gte: start, lte: end } } }),
  ]);
  const sum = <T extends { currency: string }>(rows: T[], f: (r: T) => number) => rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.currency]: (m[r.currency] ?? 0) + f(r) }), {});
  return {
    month,
    mrrCents: sum(subs, (s) => s.monthlyCents),
    arrCents: Object.fromEntries(Object.entries(sum(subs, (s) => s.monthlyCents)).map(([c, v]) => [c, v * 12])),
    activeCustomers: new Set(subs.map((s) => s.clientId)).size,
    activeSubscriptions: subs.length,
    churnedSubscriptions: churned,
    invoicedCents: sum(invoices, (i) => i.totalCents),
    collectedCents: sum(invoices.filter((i) => i.status === 'PAID'), (i) => i.totalCents),
    outstandingCents: sum(outstanding, (i) => i.totalCents),
    overdueCents: sum(outstanding.filter((i) => i.dueAt && i.dueAt < now), (i) => i.totalCents),
  };
}

/**
 * Per customer, for one month: revenue invoiced, delivery cost (hours logged
 * × the internal hourly cost), estimated infrastructure, and provider costs
 * attributed to them. Margin is revenue minus delivery and infrastructure,
 * in the invoice currency; provider costs are shown beside it.
 */
export async function customerProfitability(access: AccessContext, month: string) {
  const start = startOfMonth(new Date(`${month}-01T00:00:00Z`));
  const end = endOfMonth(start);
  const scope = clientFilter(access);
  const clients = await db.client.findMany({ where: { ...('clientId' in scope ? { id: scope.clientId as never } : {}), organizationId: access.organizationId, kind: 'CUSTOMER', subscriptions: { some: {} } }, select: { id: true, name: true } });
  const ids = clients.map((c) => c.id);
  const [org, invoices, projects, apps, usage, opportunities] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: access.organizationId }, select: { internalHourlyCostCents: true, currency: true } }),
    db.customerInvoice.findMany({ where: { clientId: { in: ids }, issuedAt: { gte: start, lte: end }, status: { notIn: ['VOID', 'DRAFT'] } }, select: { clientId: true, totalCents: true, currency: true } }),
    db.deliveryProject.findMany({ where: { clientId: { in: ids } }, select: { id: true, clientId: true } }),
    db.clientApplication.findMany({ where: { clientId: { in: ids }, status: 'ACTIVE' }, select: { clientId: true, template: { select: { monthlyInfraCentsEstimate: true } } } }),
    db.usageRecord.groupBy({ by: ['clientId', 'currency'], where: { clientId: { in: ids }, occurredAt: { gte: start, lte: end } }, _sum: { costMillicents: true } }),
    db.opportunity.findMany({ where: { customerClientId: { in: ids } }, select: { customerClientId: true, account: { select: { researchCostMillicents: true } } } }),
  ]);
  const minutes = await db.projectTimeEntry.groupBy({ by: ['projectId'], where: { projectId: { in: projects.map((p) => p.id) }, workDate: { gte: start, lte: end } }, _sum: { minutes: true } });
  return clients.map((c) => {
    const revenueCents = invoices.filter((i) => i.clientId === c.id).reduce((n, i) => n + i.totalCents, 0);
    const deliveryMinutes = projects.filter((p) => p.clientId === c.id).reduce((n, p) => n + (minutes.find((m) => m.projectId === p.id)?._sum.minutes ?? 0), 0);
    const deliveryCostCents = Math.round((deliveryMinutes / 60) * org.internalHourlyCostCents);
    const infraEstimateCents = apps.filter((a) => a.clientId === c.id).reduce((n, a) => n + (a.template?.monthlyInfraCentsEstimate ?? 0), 0);
    const marginCents = revenueCents - deliveryCostCents - infraEstimateCents;
    return {
      clientId: c.id, name: c.name, currency: invoices.find((i) => i.clientId === c.id)?.currency ?? org.currency,
      revenueCents, deliveryHours: Math.round((deliveryMinutes / 60) * 10) / 10, deliveryCostCents, infraEstimateCents,
      marginCents, marginPct: revenueCents > 0 ? Math.round((marginCents / revenueCents) * 1000) / 10 : null,
      providerCosts: usage.filter((u) => u.clientId === c.id).map((u) => ({ currency: u.currency, cents: Math.round((u._sum.costMillicents ?? 0) / 1000) })),
      /** Research spent winning them (one-off, provider currency). */
      acquisitionResearchCents: Math.round(opportunities.filter((o) => o.customerClientId === c.id).reduce((n, o) => n + (o.account.researchCostMillicents ?? 0), 0) / 1000),
    };
  });
}
