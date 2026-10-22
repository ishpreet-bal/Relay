import type Stripe from 'stripe';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { raiseAlert } from '@/server/services/alerts';
import { liveChargesEnabled, RELAY_KIND } from './stripe-adapter';

/**
 * Stripe events for customer subscriptions (metadata relay_kind =
 * customer_subscription). The webhook route has already verified the
 * signature and recorded the event id, so a redelivery isn't processed
 * twice. A live-mode event while live charges are switched off is not
 * applied; it raises a critical alert instead.
 */

const subMeta = (o: { metadata?: Stripe.Metadata | null }) => (o.metadata?.relay_kind === RELAY_KIND ? o.metadata : null);

function invoiceMeta(inv: Stripe.Invoice) {
  const m = inv.subscription_details?.metadata ?? inv.metadata ?? null;
  return m?.relay_kind === RELAY_KIND ? m : null;
}

export function isCustomerBillingEvent(event: Stripe.Event): boolean {
  const obj = event.data.object as { object?: string };
  if (event.type.startsWith('customer.subscription.')) return !!subMeta(obj as Stripe.Subscription);
  if (event.type.startsWith('invoice.') && obj.object === 'invoice') return !!invoiceMeta(obj as Stripe.Invoice);
  return false;
}

const SUB_STATUS: Record<string, string> = { active: 'ACTIVE', trialing: 'ACTIVE', past_due: 'PAST_DUE', unpaid: 'PAST_DUE', canceled: 'CANCELLED', incomplete_expired: 'CANCELLED' };
const INVOICE_STATUS: Record<string, string> = { draft: 'DRAFT', open: 'OPEN', paid: 'PAID', void: 'VOID', uncollectible: 'UNCOLLECTIBLE' };

export async function handleCustomerBillingEvent(event: Stripe.Event): Promise<{ applied: boolean; reason?: string }> {
  if (event.livemode && !liveChargesEnabled()) {
    await raiseAlert({
      organizationId: null, kind: 'billing', severity: 'critical', dedupeKey: `billing:live-event:${event.type}`,
      title: 'Live Stripe event received while live customer billing is off',
      detail: `Event ${event.id} (${event.type}) was not applied. Check which Stripe account the webhook points at.`,
    });
    return { applied: false, reason: 'live event while live billing is off' };
  }

  if (event.type.startsWith('customer.subscription.')) {
    const s = event.data.object as Stripe.Subscription & { current_period_start?: number; current_period_end?: number };
    const id = subMeta(s)?.relay_subscription_id;
    const sub = id ? await db.customerSubscription.findUnique({ where: { id } }) : null;
    if (!sub || sub.stripeSubscriptionId !== s.id) return { applied: false, reason: 'unknown subscription' };
    const status = SUB_STATUS[s.status];
    await db.customerSubscription.update({
      where: { id: sub.id },
      data: {
        ...(status ? { status } : {}),
        ...(status === 'CANCELLED' && !sub.cancelledAt ? { cancelledAt: new Date((s.canceled_at ?? event.created) * 1000) } : {}),
        cancelAtPeriodEnd: s.cancel_at_period_end,
        ...(s.current_period_start ? { currentPeriodStart: new Date(s.current_period_start * 1000) } : {}),
        ...(s.current_period_end ? { currentPeriodEnd: new Date(s.current_period_end * 1000) } : {}),
      },
    });
    return { applied: true };
  }

  const inv = event.data.object as Stripe.Invoice;
  const id = invoiceMeta(inv)?.relay_subscription_id;
  const sub = id ? await db.customerSubscription.findUnique({ where: { id } }) : null;
  if (!sub) return { applied: false, reason: 'unknown subscription' };
  const lines = inv.lines.data.map((l) => ({ label: l.description ?? 'Item', quantity: l.quantity ?? 1, unitMillicents: Math.round((l.amount / Math.max(1, l.quantity ?? 1)) * 1000), amountCents: l.amount, kind: 'stripe' }));
  const status = INVOICE_STATUS[inv.status ?? 'draft'] ?? 'OPEN';
  const paidAt = inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000) : null;
  const data = {
    number: inv.number ?? inv.id, status, lines: lines as unknown as Prisma.InputJsonValue, subtotalCents: inv.subtotal, taxCents: inv.tax ?? 0, totalCents: inv.total,
    currency: inv.currency.toUpperCase(), paidAt, dueAt: inv.due_date ? new Date(inv.due_date * 1000) : null, voidedAt: status === 'VOID' ? new Date(event.created * 1000) : null,
  };
  await db.customerInvoice.upsert({
    where: { stripeInvoiceId: inv.id },
    create: {
      ...data, organizationId: sub.organizationId, clientId: sub.clientId, subscriptionId: sub.id, kind: 'STRIPE', provider: 'stripe', stripeInvoiceId: inv.id, livemode: inv.livemode,
      periodStart: new Date(inv.period_start * 1000), periodEnd: new Date(inv.period_end * 1000), issuedAt: new Date((inv.status_transitions?.finalized_at ?? inv.created) * 1000),
    },
    update: data,
  });
  if (event.type === 'invoice.payment_failed') {
    await db.customerSubscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } });
    logger.warn('billing.payment_failed', { subscriptionId: sub.id, invoice: inv.id });
  }
  return { applied: true };
}
