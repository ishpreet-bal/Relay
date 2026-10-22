import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

/**
 * Phase F acceptance on a real Postgres, with synthetic customers and no
 * live charges: subscriptions created and authorised, usage metered from
 * the platform's own run records, ledger invoices (setup, period, final),
 * cancellation at period end and immediately, Stripe webhooks verified and
 * idempotent with live events refused, and the financial reports.
 *
 * Stripe's API itself is not called: the adapter's outbound calls are
 * replaced here (their request shape is unit-tested separately).
 */

const ORIGINAL = { ...process.env };
Object.assign(process.env, {
  APP_URL: 'http://localhost:3000', CLERK_SECRET_KEY: 'sk_test_clerk_placeholder', CLERK_WEBHOOK_SECRET: 'whsec_placeholder',
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  UNSUBSCRIBE_SIGNING_KEY: 'unit-test-unsubscribe-signing-key-0123456789', CRON_SECRET: 'unit-test-cron-secret',
  STRIPE_SECRET_KEY: 'sk_test_relay_unit', STRIPE_WEBHOOK_SECRET: 'whsec_relay_unit_test',
});
delete process.env.CUSTOMER_BILLING_LIVE;

vi.mock('../stripe-adapter', async (orig) => {
  const real = await orig<typeof import('../stripe-adapter')>();
  return {
    ...real,
    createStripeSubscription: vi.fn(async (input: { subscriptionId: string }) => ({ customerId: `cus_test_${input.subscriptionId.slice(0, 8)}`, subscriptionId: `sub_test_${input.subscriptionId.slice(0, 8)}`, livemode: false })),
    addOverage: vi.fn(async () => null),
    cancelStripeSubscription: vi.fn(async () => null),
  };
});

const { dbTestsAllowed } = await import('@/test/db');
const { db } = await import('@/lib/db');
const reachable = dbTestsAllowed() && await db.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
const billing = await import('../subscriptions');
const reports = await import('../reports');
const adapter = await import('../stripe-adapter');
const { systemAccess } = await import('@/server/access/scope');
const { POST: stripeWebhook } = await import('@/app/api/webhooks/stripe/route');
const Stripe = (await import('stripe')).default;

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe.skipIf(!reachable)('customer billing (database, test mode)', () => {
  const orgId = randomUUID();
  const staff = systemAccess(orgId);
  let userId = '';
  const c: Record<'a' | 'b' | 'demo', string> = { a: '', b: '', demo: '' };
  let appA = '';
  let subA = '';
  let subB = '';

  async function runs(clientId: string, applicationId: string, n: number, at: Date, extra: { status?: string; isTest?: boolean } = {}) {
    const config = await db.appConfigVersion.findFirstOrThrow({ where: { applicationId } });
    await db.workflowExecution.createMany({
      data: Array.from({ length: n }, (_, i) => ({
        organizationId: orgId, clientId, applicationId, configVersionId: config.id, workflowKey: 'claim_intake', trigger: 'WEBHOOK',
        status: extra.status ?? 'SUCCEEDED', isTest: extra.isTest ?? false, createdAt: new Date(at.getTime() + i * 60_000),
      })),
    });
  }

  beforeAll(async () => {
    // Loaded from .env with the database module; the app's env check wants both URLs.
    process.env.DIRECT_DATABASE_URL ||= process.env.DATABASE_URL;
    await db.organization.create({ data: { id: orgId, clerkOrgId: `test_${orgId}`, name: 'Billing test', slug: `billing-${orgId.slice(0, 8)}`, internalHourlyCostCents: 6000 } });
    userId = (await db.user.create({ data: { clerkUserId: `test_${orgId}_u`, email: `b-${orgId.slice(0, 8)}@example.test` } })).id;
    c.a = (await db.client.create({ data: { organizationId: orgId, name: 'Synthetic Northwind Parts', slug: `syn-a-${orgId.slice(0, 6)}`, primaryContactEmail: 'ap@northwind.example' } })).id;
    c.b = (await db.client.create({ data: { organizationId: orgId, name: 'Synthetic Contoso Metals', slug: `syn-b-${orgId.slice(0, 6)}` } })).id;
    c.demo = (await db.client.create({ data: { organizationId: orgId, name: 'Demo sandbox', slug: `demo-${orgId.slice(0, 6)}`, kind: 'DEMO' } })).id;
    const { createApplication, ensureBuiltinTemplates } = await import('@/server/studio/applications');
    await ensureBuiltinTemplates();
    const tv = await db.appTemplateVersion.findFirstOrThrow({ where: { template: { slug: 'manufacturing-quality-claims', organizationId: null } } });
    appA = (await createApplication(staff, userId, { clientId: c.a, templateVersionId: tv.id, name: 'Northwind claims' })).app.id;
    await db.clientApplication.update({ where: { id: appA }, data: { status: 'ACTIVE' } });
    const appB = (await createApplication(staff, userId, { clientId: c.b, templateVersionId: tv.id, name: 'Contoso claims' })).app.id;
    // September for Northwind: 130 succeeded production runs, plus runs that are never billed.
    await runs(c.a, appA, 130, d('2026-09-02'));
    await runs(c.a, appA, 10, d('2026-09-03'), { status: 'FAILED' });
    await runs(c.a, appA, 20, d('2026-09-04'), { isTest: true });
    await runs(c.b, appB, 50, d('2026-09-05'));
  });

  afterAll(async () => {
    if (reachable) {
      await db.organization.delete({ where: { id: orgId } }).catch(() => undefined);
      await db.user.deleteMany({ where: { clerkUserId: { startsWith: `test_${orgId}` } } });
    }
    await db.$disconnect();
    process.env = ORIGINAL;
  });

  it('creates drafts, never for the demo sandbox, and invoices only after authorisation', async () => {
    await expect(billing.createSubscription(staff, userId, { clientId: c.demo, name: 'Demo', monthlyCents: 100 })).rejects.toThrow(/never billed/);
    const sub = await billing.createSubscription(staff, userId, {
      clientId: c.a, applicationId: appA, name: 'Northwind claims', setupFeeCents: 135000, monthlyCents: 45000, includedRuns: 100, overageMillicentsPerRun: 5000,
    });
    subA = sub.id;
    expect(sub.status).toBe('DRAFT');
    expect(await db.customerInvoice.count({ where: { subscriptionId: subA } })).toBe(0);

    const active = await billing.authorizeSubscription(staff, userId, subA, d('2026-09-01'));
    expect([active.status, active.currentPeriodEnd?.toISOString()]).toEqual(['ACTIVE', d('2026-10-01').toISOString()]);
    const setup = await db.customerInvoice.findFirstOrThrow({ where: { subscriptionId: subA } });
    expect([setup.kind, setup.totalCents, setup.status]).toEqual(['SETUP', 135000, 'OPEN']);
    await expect(billing.authorizeSubscription(staff, userId, subA)).rejects.toThrow(/Only a draft/);
  });

  it('meters succeeded production runs and invoices the period once, with overage', async () => {
    const first = await billing.runBillingCycle(d('2026-10-02'));
    expect(first.periods).toBeGreaterThanOrEqual(1);
    expect((await billing.runBillingCycle(d('2026-10-02'))).periods).toBe(0); // nothing left to close
    const usage = await db.meteredUsage.findFirstOrThrow({ where: { subscriptionId: subA } });
    expect(usage.quantity).toBe(130); // not the 10 failed, 20 test or Contoso's 50
    const period = await db.customerInvoice.findFirstOrThrow({ where: { subscriptionId: subA, kind: 'PERIOD' } });
    // $450 monthly + 30 runs over the 100 included at $0.05.
    expect(period.totalCents).toBe(45000 + 150);
    expect((period.lines as Array<{ kind: string }>).map((l) => l.kind)).toEqual(['subscription', 'usage']);
    expect(await db.customerInvoice.count({ where: { subscriptionId: subA, kind: 'PERIOD' } })).toBe(1);
    await billing.markInvoicePaid(staff, period.id, d('2026-10-05'));
    await expect(billing.markInvoicePaid(staff, period.id)).rejects.toThrow(/paid/);
  });

  it('cancels immediately with a prorated final invoice, or at period end', async () => {
    const b = await billing.createSubscription(staff, userId, { clientId: c.b, name: 'Contoso claims', monthlyCents: 31000 });
    subB = b.id;
    await billing.authorizeSubscription(staff, userId, subB, d('2026-10-01'));
    const cancelled = await billing.cancelSubscription(staff, subB, { atPeriodEnd: false }, d('2026-10-16'));
    expect(cancelled.status).toBe('CANCELLED');
    const final = await db.customerInvoice.findFirstOrThrow({ where: { subscriptionId: subB, kind: 'FINAL' } });
    expect(final.totalCents).toBe(15000); // 15 of 31 days of $310

    await billing.cancelSubscription(staff, subA, { atPeriodEnd: true });
    expect((await db.customerSubscription.findUniqueOrThrow({ where: { id: subA } })).status).toBe('ACTIVE');
  });

  it('reports MRR, invoicing, churn and customer margin from recorded data', async () => {
    const project = await db.deliveryProject.create({ data: { organizationId: orgId, clientId: c.a, applicationId: appA, name: 'Northwind claims', estimatedHours: 10 } });
    await db.projectTimeEntry.create({ data: { projectId: project.id, category: 'support', minutes: 180, workDate: d('2026-10-07') } });
    const summary = await reports.financialSummary(staff, '2026-10', d('2026-10-20'));
    expect(summary).toMatchObject({
      mrrCents: { CAD: 45000 }, arrCents: { CAD: 540000 }, activeCustomers: 1, churnedSubscriptions: 1,
      invoicedCents: { CAD: 45150 + 15000 }, collectedCents: { CAD: 45150 }, outstandingCents: { CAD: 135000 + 15000 },
    });
    const rows = await reports.customerProfitability(staff, '2026-10');
    const north = rows.find((r) => r.clientId === c.a)!;
    // $451.50 invoiced − 3 h × $60 delivery − $15 infrastructure (template estimate).
    expect(north).toMatchObject({ revenueCents: 45150, deliveryHours: 3, deliveryCostCents: 18000, infraEstimateCents: 1500, marginCents: 25650 });
    const history = await reports.mrrHistory(staff, 3, d('2026-10-20'));
    expect(history.map((h) => h.mrrCents.CAD ?? 0)).toEqual([0, 45000, 45000]);

    // October closes; Northwind was set to cancel at period end.
    await billing.runBillingCycle(d('2026-11-02'));
    const a = await db.customerSubscription.findUniqueOrThrow({ where: { id: subA } });
    expect([a.status, a.cancelledAt?.toISOString()]).toEqual(['CANCELLED', d('2026-11-01').toISOString()]);
  });

  it('refuses live charges unless explicitly enabled', () => {
    expect(adapter.modeOf(undefined)).toBe('unconfigured');
    expect(adapter.modeOf('sk_test_x')).toBe('test');
    expect(adapter.modeOf('sk_live_x')).toBe('live');
    expect(adapter.modeOf('rk_live_x')).toBe('live');
    expect(() => adapter.assertStripeUsable('live', false)).toThrow(/Live customer charges are switched off/);
    expect(adapter.assertStripeUsable('live', true)).toEqual({ livemode: true });
    expect(adapter.assertStripeUsable('test', false)).toEqual({ livemode: false });
    expect(() => adapter.assertStripeUsable('unconfigured', false)).toThrow(/not configured/);
  });

  it('takes Stripe webhooks only when signed, once each, and never applies a live event', async () => {
    const sub = await billing.createSubscription(staff, userId, { clientId: c.b, name: 'Contoso (Stripe)', provider: 'stripe', monthlyCents: 20000, setupFeeCents: 50000 });
    const active = await billing.authorizeSubscription(staff, userId, sub.id, d('2026-10-20'));
    expect(active.stripeSubscriptionId).toMatch(/^sub_test_/);
    expect(await db.customerInvoice.count({ where: { subscriptionId: sub.id } })).toBe(0); // Stripe invoices, mirrored by webhook

    const stripe = new Stripe('sk_test_relay_unit');
    const meta = { relay_kind: 'customer_subscription', relay_subscription_id: sub.id, relay_org: orgId };
    const invoiceEvent = (id: string, livemode = false) => ({
      id, object: 'event', type: 'invoice.paid', livemode, created: 1792000000, api_version: '2025-02-24.acacia',
      data: { object: {
        id: `in_${id}`, object: 'invoice', livemode, number: 'STRIPE-0001', status: 'paid', currency: 'cad', subtotal: 70000, tax: 0, total: 70000,
        period_start: 1792000000, period_end: 1794600000, created: 1792000000, due_date: null,
        status_transitions: { paid_at: 1792100000, finalized_at: 1792000100 },
        subscription_details: { metadata: meta }, metadata: {},
        lines: { object: 'list', data: [{ description: 'Setup', quantity: 1, amount: 50000 }, { description: 'Monthly', quantity: 1, amount: 20000 }] },
      } },
    });
    const post = (payload: string, signature: string) => stripeWebhook(new Request('http://localhost/api/webhooks/stripe', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } }));
    const signed = (payload: string) => stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_relay_unit_test' });

    const payload = JSON.stringify(invoiceEvent('evt_test_paid'));
    expect((await post(payload, 't=1,v1=forged')).status).toBe(401);
    expect((await post(payload, signed(payload))).status).toBe(200);
    expect(await (await post(payload, signed(payload))).json()).toMatchObject({ deduped: true });
    const mirrored = await db.customerInvoice.findUniqueOrThrow({ where: { stripeInvoiceId: 'in_evt_test_paid' } });
    expect([mirrored.kind, mirrored.status, mirrored.totalCents, mirrored.clientId]).toEqual(['STRIPE', 'PAID', 70000, c.b]);

    const live = JSON.stringify(invoiceEvent('evt_live_paid', true));
    expect((await post(live, signed(live))).status).toBe(200);
    expect(await db.customerInvoice.count({ where: { stripeInvoiceId: 'in_evt_live_paid' } })).toBe(0);
    expect(await db.systemAlert.count({ where: { dedupeKey: 'billing:live-event:invoice.paid' } })).toBe(1);
    await db.systemAlert.deleteMany({ where: { dedupeKey: 'billing:live-event:invoice.paid' } });
    await db.webhookEvent.deleteMany({ where: { externalId: { in: ['evt_test_paid', 'evt_live_paid'] } } });
  });
});
