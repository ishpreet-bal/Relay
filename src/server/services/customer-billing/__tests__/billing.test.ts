import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { periodLines, setupLines, total } from '../invoice-math';
import { addOverage, createStripeSubscription } from '../stripe-adapter';

const terms = { monthlyCents: 45000, includedRuns: 100, overageMillicentsPerRun: 2500, setupFeeCents: 120000 };
const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('invoice math', () => {
  it('bills the month and runs above the included amount, exactly', () => {
    const lines = periodLines(terms, 'Claims', { start: d('2026-09-01'), end: d('2026-10-01'), fullEnd: d('2026-10-01') }, 133);
    expect(lines.map((l) => [l.kind, l.quantity, l.amountCents])).toEqual([['subscription', 1, 45000], ['usage', 33, 83]]);
    expect(total(lines)).toBe(45083);
    expect(periodLines(terms, 'Claims', { start: d('2026-09-01'), end: d('2026-10-01'), fullEnd: d('2026-10-01') }, 100)).toHaveLength(1);
    expect(setupLines(terms, 'Claims')[0]!.amountCents).toBe(120000);
    expect(setupLines({ ...terms, setupFeeCents: 0 }, 'Claims')).toEqual([]);
  });

  it('prorates a part-period by days', () => {
    const lines = periodLines(terms, 'Claims', { start: d('2026-09-01'), end: d('2026-09-11'), fullEnd: d('2026-10-01') }, 0);
    expect(lines[0]).toMatchObject({ label: 'Claims: 10 of 30 days', amountCents: 15000 });
  });
});

describe('stripe adapter requests', () => {
  function fakeClient() {
    const calls: Array<{ what: string; params: Record<string, unknown>; opts: { idempotencyKey?: string } }> = [];
    const rec = (what: string, result: object) => async (params: Record<string, unknown>, opts: { idempotencyKey?: string }) => { calls.push({ what, params, opts }); return result; };
    const client = {
      customers: { create: rec('customer', { id: 'cus_1' }) },
      products: { create: rec('product', { id: 'prod_1' }) },
      subscriptions: { create: rec('subscription', { id: 'sub_1', livemode: false }) },
      invoiceItems: { create: rec('invoiceItem', { id: 'ii_1' }) },
    } as unknown as Stripe;
    return { client, calls };
  }

  it('creates customer, product and an emailed monthly subscription, each with an idempotency key', async () => {
    const { client, calls } = fakeClient();
    const res = await createStripeSubscription({ subscriptionId: 'abc', organizationId: 'org', name: 'Claims', currency: 'CAD', monthlyCents: 45000, setupFeeCents: 120000, customer: { name: 'Synthetic Co', email: null } }, client);
    expect(res).toEqual({ customerId: 'cus_1', subscriptionId: 'sub_1', livemode: false });
    expect(calls.map((c) => [c.what, c.opts.idempotencyKey])).toEqual([['customer', 'relay-customer-abc'], ['product', 'relay-product-abc'], ['subscription', 'relay-subscription-abc']]);
    const sub = calls[2]!.params as { collection_method: string; days_until_due: number; items: Array<{ price_data: { currency: string; unit_amount: number; recurring: object } }>; add_invoice_items: Array<{ price_data: { unit_amount: number } }>; metadata: Record<string, string> };
    expect(sub.collection_method).toBe('send_invoice');
    expect(sub.days_until_due).toBe(14);
    expect(sub.items[0]!.price_data).toMatchObject({ currency: 'cad', unit_amount: 45000, recurring: { interval: 'month' } });
    expect(sub.add_invoice_items[0]!.price_data.unit_amount).toBe(120000);
    expect(sub.metadata).toEqual({ relay_kind: 'customer_subscription', relay_subscription_id: 'abc', relay_org: 'org' });
  });

  it('adds overage once per period and skips zero', async () => {
    const { client, calls } = fakeClient();
    const args = { subscriptionId: 'abc', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', currency: 'CAD', amountCents: 83, description: 'Runs', periodKey: '2026-09-01' };
    await addOverage(args, client);
    expect(await addOverage({ ...args, amountCents: 0 }, client)).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.opts.idempotencyKey).toBe('relay-overage-abc-2026-09-01');
    expect(calls[0]!.params).toMatchObject({ customer: 'cus_1', subscription: 'sub_1', currency: 'cad', amount: 83 });
  });
});
