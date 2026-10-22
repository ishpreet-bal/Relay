import { addDays } from 'date-fns';
import { Prisma, type CustomerSubscription } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { assertClientAccess, clientFilter, type AccessContext } from '@/server/access/scope';
import { DomainError, NotFoundError } from '@/server/errors';
import { raiseAlert } from '@/server/services/alerts';
import { nextPeriodEnd, periodLines, setupLines, total, type InvoiceLine } from './invoice-math';
import { addOverage, assertStripeUsable, cancelStripeSubscription, createStripeSubscription } from './stripe-adapter';

/**
 * Customer subscriptions. A subscription is a draft until a billing admin
 * authorises it; only then does anything get invoiced or sent to Stripe.
 *
 * ledger: Relay issues the invoices (monthly in arrears: the fee plus runs
 *   above the included amount) and someone marks them paid.
 * stripe: Stripe invoices monthly in advance; runs above the included
 *   amount are added to the next Stripe invoice; Stripe's invoices are
 *   mirrored back by webhook.
 *
 * Usage is the count of succeeded production runs from the platform's own
 * records, per period, kept as MeteredUsage. Runs that failed are not billed.
 */

const uuid = z.string().uuid();

export const subscriptionSchema = z.object({
  clientId: uuid,
  applicationId: uuid.nullish(),
  projectId: uuid.nullish(),
  name: z.string().trim().min(1).max(120),
  provider: z.enum(['ledger', 'stripe']).default('ledger'),
  currency: z.string().regex(/^[A-Z]{3}$/).default('CAD'),
  setupFeeCents: z.number().int().min(0).max(100_000_000).default(0),
  monthlyCents: z.number().int().min(0).max(10_000_000),
  includedRuns: z.number().int().min(0).max(100_000_000).default(0),
  overageMillicentsPerRun: z.number().int().min(0).max(100_000_000).default(0),
});

async function loadSub(access: AccessContext, id: string) {
  const sub = await db.customerSubscription.findFirst({ where: { id, ...clientFilter(access) } });
  if (!sub) throw new NotFoundError('Subscription');
  return sub;
}

async function assertBillableClient(organizationId: string, clientId: string) {
  const client = await db.client.findFirst({ where: { id: clientId, organizationId, archivedAt: null } });
  if (!client) throw new NotFoundError('Client');
  if (client.kind !== 'CUSTOMER') throw new DomainError('The demo sandbox is never billed.');
  return client;
}

export async function createSubscription(access: AccessContext, userId: string | null, raw: z.input<typeof subscriptionSchema>) {
  const input = subscriptionSchema.parse(raw);
  assertClientAccess(access, input.clientId);
  await assertBillableClient(access.organizationId, input.clientId);
  if (input.applicationId && !(await db.clientApplication.count({ where: { id: input.applicationId, clientId: input.clientId } }))) throw new NotFoundError('Application');
  if (input.projectId && !(await db.deliveryProject.count({ where: { id: input.projectId, clientId: input.clientId } }))) throw new NotFoundError('Project');
  return db.customerSubscription.create({ data: { ...input, organizationId: access.organizationId, createdById: userId } });
}

/** A draft priced from a delivery project's accepted proposal. */
export async function draftFromProject(access: AccessContext, userId: string | null, projectId: string, overrides: { includedRuns?: number; overageMillicentsPerRun?: number; provider?: 'ledger' | 'stripe' } = {}) {
  const project = await db.deliveryProject.findFirst({ where: { id: projectId, ...clientFilter(access) } });
  if (!project) throw new NotFoundError('Project');
  const org = await db.organization.findUniqueOrThrow({ where: { id: project.organizationId }, select: { currency: true } });
  return createSubscription(access, userId, {
    clientId: project.clientId, applicationId: project.applicationId, projectId: project.id, name: project.name.slice(0, 120),
    currency: org.currency, setupFeeCents: project.priceSetupCents, monthlyCents: project.priceMonthlyCents,
    includedRuns: overrides.includedRuns ?? 1000, overageMillicentsPerRun: overrides.overageMillicentsPerRun ?? 0, provider: overrides.provider ?? 'ledger',
  });
}

export async function updateDraft(access: AccessContext, id: string, raw: Partial<z.input<typeof subscriptionSchema>>) {
  const sub = await loadSub(access, id);
  if (sub.status !== 'DRAFT') throw new DomainError('Only a draft can be edited; cancel and start a new subscription to change terms.');
  const input = subscriptionSchema.partial().omit({ clientId: true }).parse(raw);
  return db.customerSubscription.update({ where: { id: sub.id }, data: input });
}

// ---------------------------------------------------------------------------
// Invoices (ledger)
// ---------------------------------------------------------------------------

async function nextInvoiceNumber(organizationId: string, at: Date) {
  const prefix = `INV-${at.getUTCFullYear()}-`;
  const latest = await db.customerInvoice.findFirst({ where: { organizationId, number: { startsWith: prefix } }, orderBy: { number: 'desc' }, select: { number: true } });
  return `${prefix}${String((latest ? Number(latest.number.slice(prefix.length)) : 0) + 1).padStart(4, '0')}`;
}

/** Issues a ledger invoice once per subscription, kind and period. */
async function issueInvoice(sub: CustomerSubscription, kind: 'SETUP' | 'PERIOD' | 'FINAL', period: { start: Date; end: Date }, lines: InvoiceLine[], at: Date) {
  const idempotencyKey = `${sub.id}:${kind}:${period.start.toISOString()}`;
  const existing = await db.customerInvoice.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;
  if (!lines.length || total(lines) <= 0) return null;
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.customerInvoice.create({
        data: {
          organizationId: sub.organizationId, clientId: sub.clientId, subscriptionId: sub.id, number: await nextInvoiceNumber(sub.organizationId, at), kind,
          periodStart: period.start, periodEnd: period.end, lines: lines as unknown as Prisma.InputJsonValue,
          subtotalCents: total(lines), totalCents: total(lines), currency: sub.currency, status: 'OPEN', provider: 'ledger',
          idempotencyKey, issuedAt: at, dueAt: addDays(at, 14),
        },
      });
    } catch (err) {
      // Two invoices racing for the same number: take the next one.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && attempt < 3) {
        const again = await db.customerInvoice.findUnique({ where: { idempotencyKey } });
        if (again) return again;
        continue;
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Authorisation, periods, cancellation
// ---------------------------------------------------------------------------

const appName = async (sub: CustomerSubscription) =>
  sub.applicationId ? (await db.clientApplication.findUnique({ where: { id: sub.applicationId }, select: { name: true } }))?.name ?? sub.name : sub.name;

/**
 * The billing admin's go-ahead. Ledger subscriptions start invoicing here;
 * Stripe subscriptions are created in Stripe here (and refused for a live
 * key unless live charges are switched on).
 */
export async function authorizeSubscription(access: AccessContext, userId: string, id: string, at = new Date()) {
  const sub = await loadSub(access, id);
  if (sub.status !== 'DRAFT') throw new DomainError('Only a draft is authorised.');
  const client = await assertBillableClient(sub.organizationId, sub.clientId);
  let stripeIds: { stripeCustomerId: string; stripeSubscriptionId: string; livemode: boolean } | null = null;
  if (sub.provider === 'stripe') {
    assertStripeUsable();
    const created = await createStripeSubscription({
      subscriptionId: sub.id, organizationId: sub.organizationId, name: await appName(sub), currency: sub.currency, monthlyCents: sub.monthlyCents, setupFeeCents: sub.setupFeeCents,
      customer: { name: client.name, email: client.primaryContactEmail },
    });
    stripeIds = { stripeCustomerId: created.customerId, stripeSubscriptionId: created.subscriptionId, livemode: created.livemode };
  }
  const updated = await db.customerSubscription.update({
    where: { id: sub.id },
    data: { status: 'ACTIVE', authorizedById: userId, authorizedAt: at, startedAt: at, currentPeriodStart: at, currentPeriodEnd: nextPeriodEnd(at), ...(stripeIds ?? {}) },
  });
  if (sub.provider === 'ledger') await issueInvoice(updated, 'SETUP', { start: at, end: at }, setupLines(updated, await appName(updated)), at);
  return updated;
}

export async function countBillableRuns(sub: Pick<CustomerSubscription, 'clientId' | 'applicationId'>, start: Date, end: Date) {
  return db.workflowExecution.count({
    where: { clientId: sub.clientId, ...(sub.applicationId ? { applicationId: sub.applicationId } : {}), isTest: false, status: 'SUCCEEDED', createdAt: { gte: start, lt: end } },
  });
}

async function meter(sub: CustomerSubscription, start: Date, end: Date) {
  const runs = await countBillableRuns(sub, start, end);
  await db.meteredUsage.upsert({
    where: { subscriptionId_metric_periodStart: { subscriptionId: sub.id, metric: 'workflow_runs', periodStart: start } },
    create: { organizationId: sub.organizationId, clientId: sub.clientId, subscriptionId: sub.id, metric: 'workflow_runs', periodStart: start, periodEnd: end, quantity: runs },
    update: { quantity: runs, periodEnd: end, measuredAt: new Date() },
  });
  return runs;
}

/** Closes every period of this subscription that has ended by `until`, in order. Idempotent. */
export async function closeEndedPeriods(subscriptionId: string, until = new Date()) {
  let sub = await db.customerSubscription.findUniqueOrThrow({ where: { id: subscriptionId } });
  const closed: string[] = [];
  while (['ACTIVE', 'PAST_DUE'].includes(sub.status) && sub.currentPeriodStart && sub.currentPeriodEnd && sub.currentPeriodEnd <= until) {
    const start = sub.currentPeriodStart;
    const end = sub.currentPeriodEnd;
    const runs = await meter(sub, start, end);
    const name = await appName(sub);
    const lines = periodLines(sub, name, { start, end, fullEnd: end }, runs);
    if (sub.provider === 'ledger') {
      await issueInvoice(sub, 'PERIOD', { start, end }, lines, end);
    } else if (sub.stripeCustomerId && sub.stripeSubscriptionId) {
      // Stripe already bills the monthly fee; only usage above the included runs is added.
      const usage = lines.filter((l) => l.kind === 'usage');
      if (usage.length) {
        assertStripeUsable();
        await addOverage({ subscriptionId: sub.id, stripeCustomerId: sub.stripeCustomerId, stripeSubscriptionId: sub.stripeSubscriptionId, currency: sub.currency, amountCents: total(usage), description: usage[0]!.label, periodKey: start.toISOString().slice(0, 10) });
      }
    }
    closed.push(start.toISOString());
    sub = await db.customerSubscription.update({
      where: { id: sub.id },
      data: sub.cancelAtPeriodEnd
        ? { status: 'CANCELLED', cancelledAt: end, currentPeriodStart: null, currentPeriodEnd: null }
        : { currentPeriodStart: end, currentPeriodEnd: nextPeriodEnd(end) },
    });
  }
  return { closed, subscription: sub };
}

/** The scheduler's daily pass: close ended periods for every active subscription. */
export async function runBillingCycle(now = new Date()) {
  const due = await db.customerSubscription.findMany({ where: { status: { in: ['ACTIVE', 'PAST_DUE'] }, currentPeriodEnd: { lte: now } }, select: { id: true, organizationId: true, name: true }, take: 500 });
  let periods = 0;
  for (const s of due) {
    try {
      periods += (await closeEndedPeriods(s.id, now)).closed.length;
    } catch (err) {
      logger.error('billing.period_close_failed', { subscriptionId: s.id, error: err });
      await raiseAlert({ organizationId: s.organizationId, kind: 'billing', dedupeKey: `billing:close:${s.id}`, severity: 'critical', title: `Billing period could not be closed: ${s.name}`, detail: err instanceof Error ? err.message : String(err) }).catch(() => undefined);
    }
  }
  return { subscriptions: due.length, periods };
}

export async function cancelSubscription(access: AccessContext, id: string, opts: { atPeriodEnd: boolean }, at = new Date()) {
  const sub = await loadSub(access, id);
  if (sub.status === 'CANCELLED') return sub;
  if (sub.status === 'DRAFT') return db.customerSubscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED', cancelledAt: at } });
  if (sub.provider === 'stripe' && sub.stripeSubscriptionId) {
    assertStripeUsable();
    await cancelStripeSubscription(sub.stripeSubscriptionId, opts.atPeriodEnd);
  }
  if (opts.atPeriodEnd) return db.customerSubscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true } });
  // Immediately: close what has ended, then a final invoice for the part-period.
  const { subscription: current } = await closeEndedPeriods(sub.id, at);
  if (current.status === 'CANCELLED') return current;
  if (current.provider === 'ledger' && current.currentPeriodStart && current.currentPeriodEnd) {
    const runs = await meter(current, current.currentPeriodStart, at);
    const lines = periodLines(current, await appName(current), { start: current.currentPeriodStart, end: at, fullEnd: current.currentPeriodEnd }, runs);
    await issueInvoice(current, 'FINAL', { start: current.currentPeriodStart, end: at }, lines, at);
  }
  return db.customerSubscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED', cancelledAt: at, currentPeriodStart: null, currentPeriodEnd: null } });
}

async function loadInvoice(access: AccessContext, id: string) {
  const inv = await db.customerInvoice.findFirst({ where: { id, ...clientFilter(access) } });
  if (!inv) throw new NotFoundError('Invoice');
  return inv;
}

export async function markInvoicePaid(access: AccessContext, id: string, paidAt = new Date()) {
  const inv = await loadInvoice(access, id);
  if (inv.provider !== 'ledger') throw new DomainError('Stripe invoices are marked paid by Stripe.');
  if (inv.status !== 'OPEN') throw new DomainError(`The invoice is ${inv.status.toLowerCase()}.`);
  return db.customerInvoice.update({ where: { id: inv.id }, data: { status: 'PAID', paidAt } });
}

export async function voidInvoice(access: AccessContext, id: string) {
  const inv = await loadInvoice(access, id);
  if (inv.provider !== 'ledger') throw new DomainError('Void Stripe invoices in Stripe.');
  if (inv.status !== 'OPEN') throw new DomainError(`The invoice is ${inv.status.toLowerCase()}.`);
  return db.customerInvoice.update({ where: { id: inv.id }, data: { status: 'VOID', voidedAt: new Date() } });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function listSubscriptions(access: AccessContext, clientId?: string | null) {
  const rows = await db.customerSubscription.findMany({ where: clientFilter(access, clientId), orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }], include: { client: { select: { id: true, name: true } } }, take: 500 });
  const usage = await db.meteredUsage.findMany({ where: { subscriptionId: { in: rows.map((r) => r.id) } }, orderBy: { periodStart: 'desc' } });
  return Promise.all(rows.map(async (r) => ({
    ...r,
    runsThisPeriod: r.currentPeriodStart ? await countBillableRuns(r, r.currentPeriodStart, new Date()) : null,
    lastPeriodRuns: usage.find((u) => u.subscriptionId === r.id)?.quantity ?? null,
  })));
}

export async function listInvoices(access: AccessContext, opts: { clientId?: string | null; subscriptionId?: string | null; status?: string | null } = {}) {
  return db.customerInvoice.findMany({
    where: { ...clientFilter(access, opts.clientId), ...(opts.subscriptionId ? { subscriptionId: opts.subscriptionId } : {}), ...(opts.status ? { status: opts.status } : {}) },
    orderBy: { issuedAt: 'desc' },
    take: 300,
    include: { subscription: { select: { name: true } } },
  });
}
