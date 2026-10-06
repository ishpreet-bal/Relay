import type Stripe from 'stripe';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { stripe, syncSubscription, recordInvoice } from '@/server/services/billing';

/**
 * Stripe webhooks.
 *
 * Stripe signs with its own scheme, not Svix, so this uses constructEvent
 * rather than the shared verifier. The raw body must be passed through
 * untouched — parsing it first breaks the signature.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response('Billing webhooks are not configured', { status: 503 });
  const signature = (await headers()).get('stripe-signature');
  if (!signature) return new Response('Missing stripe-signature', { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    return new Response(
      `Signature verification failed: ${err instanceof Error ? err.message : 'unknown'}`,
      { status: 401 },
    );
  }

  const seen = await db.webhookEvent.findUnique({
    where: { provider_externalId: { provider: 'stripe', externalId: event.id } },
  });
  if (seen?.processedAt) return Response.json({ received: true, deduped: true });

  await db.webhookEvent.upsert({
    where: { provider_externalId: { provider: 'stripe', externalId: event.id } },
    create: { provider: 'stripe', externalId: event.id, type: event.type, payload: event as never },
    update: {},
  });

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.paid':
      case 'invoice.payment_failed':
      case 'invoice.finalized':
        await recordInvoice(event.data.object as Stripe.Invoice);
        break;

      case 'checkout.session.completed': {
        // The subscription events do the real work; this is belt and braces for
        // the case where they arrive out of order.
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const sub = await stripe().subscriptions.retrieve(session.subscription as string);
          await syncSubscription(sub);
        }
        break;
      }
    }

    await db.webhookEvent.update({
      where: { provider_externalId: { provider: 'stripe', externalId: event.id } },
      data: { processedAt: new Date() },
    });
  } catch (err) {
    await db.webhookEvent.update({
      where: { provider_externalId: { provider: 'stripe', externalId: event.id } },
      data: { error: err instanceof Error ? err.message : 'unknown' },
    });
    // 500 makes Stripe retry with backoff.
    return new Response('Processing failed', { status: 500 });
  }

  return Response.json({ received: true });
}
