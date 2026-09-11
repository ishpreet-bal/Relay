import Stripe from 'stripe';
import { db } from '@/lib/db';
import { env, requireEnv } from '@/lib/env';
import type { Plan } from '@prisma/client';

let client: Stripe | null = null;
export function stripe() {
  client ??= new Stripe(requireEnv('STRIPE_SECRET_KEY', 'Billing'), { apiVersion: '2025-02-24.acacia' });
  return client;
}

/**
 * Billing.
 *
 * Stripe is the source of truth for subscription state; the `plan` column is a
 * cache updated by webhook. Nothing in the app writes `plan` directly from a
 * checkout redirect — a user who closes the tab before the redirect, or one who
 * edits the success URL, must not be able to desynchronize their own billing.
 */

/** Maps a Stripe price lookup key to a plan. Configure these in Stripe. */
const PRICE_TO_PLAN: Record<string, Plan> = {
  foundry_solo_monthly: 'SOLO',
  foundry_solo_yearly: 'SOLO',
  foundry_agency_monthly: 'AGENCY',
  foundry_agency_yearly: 'AGENCY',
  foundry_scale_monthly: 'SCALE',
  foundry_scale_yearly: 'SCALE',
};

export async function ensureCustomer(organizationId: string, email: string) {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  if (org.stripeCustomerId) return org.stripeCustomerId;

  const customer = await stripe().customers.create({
    email,
    name: org.name,
    metadata: { organizationId },
  });

  await db.organization.update({
    where: { id: organizationId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

export async function createCheckoutSession(params: {
  organizationId: string;
  email: string;
  priceLookupKey: string;
  seats: number;
}) {
  const customerId = await ensureCustomer(params.organizationId, params.email);

  const prices = await stripe().prices.list({ lookup_keys: [params.priceLookupKey], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) throw new Error(`No active Stripe price found for "${params.priceLookupKey}"`);

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: price.id, quantity: Math.max(1, params.seats) }],
    success_url: `${env().APP_URL}/settings/billing?checkout=complete`,
    cancel_url: `${env().APP_URL}/settings/billing?checkout=cancelled`,
    // The organization id travels on the subscription so the webhook can find
    // the workspace without trusting anything from the browser.
    subscription_data: { metadata: { organizationId: params.organizationId } },
    metadata: { organizationId: params.organizationId },
    allow_promotion_codes: true,
  });

  return session.url;
}

export async function createPortalSession(organizationId: string, email: string) {
  const customerId = await ensureCustomer(organizationId, email);
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env().APP_URL}/settings/billing`,
  });
  return session.url;
}

/** Applies subscription state from Stripe. Called only by the webhook. */
export async function syncSubscription(subscription: Stripe.Subscription) {
  const organizationId = subscription.metadata?.organizationId;
  if (!organizationId) {
    console.warn(`Subscription ${subscription.id} has no organizationId metadata; ignoring.`);
    return;
  }

  const item = subscription.items.data[0];
  const lookupKey = item?.price?.lookup_key ?? '';
  const plan = PRICE_TO_PLAN[lookupKey];

  // An unrecognized price is a configuration error, not a reason to downgrade
  // a paying customer. Leave the plan alone and make noise.
  if (!plan) {
    console.error(`Unrecognized Stripe price lookup key "${lookupKey}" on ${subscription.id}. Plan unchanged.`);
    return;
  }

  const active = ['active', 'trialing', 'past_due'].includes(subscription.status);

  await db.organization.update({
    where: { id: organizationId },
    data: {
      stripeSubscriptionId: subscription.id,
      // A cancelled subscription falls back to TRIAL rather than being locked
      // out entirely — the data stays readable, the limits tighten.
      plan: active ? plan : 'TRIAL',
      planSeats: item?.quantity ?? 1,
      trialEndsAt: subscription.status === 'trialing' && subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
    },
  });
}

export async function recordInvoice(invoice: Stripe.Invoice) {
  const organizationId = (invoice.subscription_details?.metadata?.organizationId as string | undefined)
    ?? (invoice.metadata?.organizationId as string | undefined);
  if (!organizationId) return;

  await db.invoice.upsert({
    where: { stripeInvoiceId: invoice.id },
    create: {
      organizationId,
      number: invoice.number ?? invoice.id,
      stripeInvoiceId: invoice.id,
      amountCents: invoice.amount_due,
      currency: invoice.currency.toUpperCase(),
      status: invoice.status ?? 'draft',
      dueAt: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
      paidAt: invoice.status === 'paid' && invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000)
        : null,
    },
    update: {
      status: invoice.status ?? 'draft',
      amountCents: invoice.amount_due,
      paidAt: invoice.status === 'paid' && invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000)
        : null,
    },
  });
}
