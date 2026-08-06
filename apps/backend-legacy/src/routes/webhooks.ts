import { FastifyInstance } from 'fastify';
import { prisma } from '@kephale/database';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2023-10-16' as any,
});

export async function webhookRoutes(fastify: FastifyInstance) {
  fastify.post('/stripe', { config: { rawBody: true } }, async (request, reply) => {
    const sig = request.headers['stripe-signature'] as string;
    let event: Stripe.Event;

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    try {
      const rawPayload = (request as any).rawBody || JSON.stringify(request.body);
      if (webhookSecret && sig) {
        event = stripe.webhooks.constructEvent(
          rawPayload,
          sig,
          webhookSecret
        );
      } else {
        event = request.body as Stripe.Event;
      }
    } catch (err: any) {
      fastify.log.error({ err }, 'Invalid Stripe Webhook Signature');
      return reply.status(400).send({ error: `Webhook Error: ${err.message}` });
    }

    switch (event.type) {
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: {
            status: mapStripeStatus(sub.status),
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            tier: mapPriceToTier(sub.items.data[0]?.price.id),
          },
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: {
            tier: 'FREE',
            status: 'CANCELED',
            cancelAtPeriodEnd: false,
          },
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.customer) {
          await prisma.subscription.updateMany({
            where: { stripeCustomerId: invoice.customer as string },
            data: { status: 'PAST_DUE' },
          });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.customer) {
          await prisma.subscription.updateMany({
            where: { stripeCustomerId: invoice.customer as string },
            data: { status: 'ACTIVE' },
          });
        }
        break;
      }

      default:
        fastify.log.info({ type: event.type }, 'Ignored Stripe webhook event');
    }

    return reply.status(200).send({ received: true });
  });
}

function mapStripeStatus(status: Stripe.Subscription.Status): 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'TRIALING' | 'INCOMPLETE' {
  const map: Record<string, 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'TRIALING' | 'INCOMPLETE'> = {
    active: 'ACTIVE',
    past_due: 'PAST_DUE',
    canceled: 'CANCELED',
    unpaid: 'PAST_DUE',
    trialing: 'TRIALING',
    incomplete: 'INCOMPLETE',
  };
  return map[status] || 'CANCELED';
}

function mapPriceToTier(priceId?: string): 'FREE' | 'PREMIUM' | 'PREMIUM_PLUS' {
  if (!priceId) return 'FREE';
  if (priceId === process.env.STRIPE_PRICE_PREMIUM_PLUS) return 'PREMIUM_PLUS';
  if (priceId === process.env.STRIPE_PRICE_PREMIUM) return 'PREMIUM';
  return 'FREE';
}
