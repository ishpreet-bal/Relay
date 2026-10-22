import type Stripe from 'stripe';
import { env } from '@/lib/env';
import { DomainError, NotConfiguredError } from '@/server/errors';
import { stripe } from '@/server/services/billing';

/**
 * Stripe for customer subscriptions. Test keys work as soon as they are set;
 * a live key charges nobody until CUSTOMER_BILLING_LIVE=enabled is set as
 * well, and every subscription still needs a billing admin's authorisation
 * in Relay. Every write carries an idempotency key, so a retry never
 * creates a second customer, subscription or charge.
 *
 * Customer objects carry relay_kind=customer_subscription in their
 * metadata; the webhook route uses it to keep these events apart from the
 * workspace's own Relay plan.
 */

export const RELAY_KIND = 'customer_subscription';

export type StripeMode = 'unconfigured' | 'test' | 'live';

export function modeOf(key: string | undefined): StripeMode {
  if (!key) return 'unconfigured';
  return /^(sk|rk)_live_/.test(key) ? 'live' : 'test';
}

export const stripeMode = () => modeOf(env().STRIPE_SECRET_KEY);

export function liveChargesEnabled() {
  return env().CUSTOMER_BILLING_LIVE === 'enabled';
}

/** Refuses before any Stripe call that could charge a real card without the explicit switch. */
export function assertStripeUsable(mode: StripeMode = stripeMode(), liveEnabled = liveChargesEnabled()): { livemode: boolean } {
  if (mode === 'unconfigured') throw new NotConfiguredError('stripe', 'Stripe is not configured. Set STRIPE_SECRET_KEY (a test key is enough to try it).');
  if (mode === 'live' && !liveEnabled) {
    throw new DomainError('Live customer charges are switched off. Use a Stripe test key, or set CUSTOMER_BILLING_LIVE=enabled once you have decided to charge real customers.');
  }
  return { livemode: mode === 'live' };
}

export interface StripeSubscriptionInput {
  subscriptionId: string;
  organizationId: string;
  name: string;
  currency: string;
  monthlyCents: number;
  setupFeeCents: number;
  customer: { name: string; email: string | null };
}

/**
 * A customer, a product and a monthly subscription invoiced by email
 * (collection_method send_invoice, net 14), with the setup fee on the first
 * invoice. Stripe bills each month in advance.
 */
export async function createStripeSubscription(input: StripeSubscriptionInput, client: Stripe = stripe()) {
  const key = (what: string) => `relay-${what}-${input.subscriptionId}`;
  const metadata = { relay_kind: RELAY_KIND, relay_subscription_id: input.subscriptionId, relay_org: input.organizationId };
  const currency = input.currency.toLowerCase();
  const customer = await client.customers.create({ name: input.customer.name, email: input.customer.email ?? undefined, metadata }, { idempotencyKey: key('customer') });
  const product = await client.products.create({ name: input.name, metadata }, { idempotencyKey: key('product') });
  const subscription = await client.subscriptions.create({
    customer: customer.id,
    collection_method: 'send_invoice',
    days_until_due: 14,
    items: [{ price_data: { currency, product: product.id, unit_amount: input.monthlyCents, recurring: { interval: 'month' } } }],
    ...(input.setupFeeCents > 0 ? { add_invoice_items: [{ price_data: { currency, product: product.id, unit_amount: input.setupFeeCents } }] } : {}),
    metadata,
  }, { idempotencyKey: key('subscription') });
  return { customerId: customer.id, subscriptionId: subscription.id, livemode: subscription.livemode };
}

/** Runs above the included amount, added to the next Stripe invoice. */
export async function addOverage(args: { subscriptionId: string; stripeCustomerId: string; stripeSubscriptionId: string; currency: string; amountCents: number; description: string; periodKey: string }, client: Stripe = stripe()) {
  if (args.amountCents <= 0) return null;
  return client.invoiceItems.create({
    customer: args.stripeCustomerId, subscription: args.stripeSubscriptionId, currency: args.currency.toLowerCase(), amount: args.amountCents, description: args.description,
    metadata: { relay_kind: RELAY_KIND, relay_subscription_id: args.subscriptionId },
  }, { idempotencyKey: `relay-overage-${args.subscriptionId}-${args.periodKey}` });
}

export async function cancelStripeSubscription(stripeSubscriptionId: string, atPeriodEnd: boolean, client: Stripe = stripe()) {
  return atPeriodEnd
    ? client.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true })
    : client.subscriptions.cancel(stripeSubscriptionId);
}
