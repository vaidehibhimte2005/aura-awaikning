import { env } from '../../config/env.js';

const cfg = env.payments.stripe;
let client;

async function getClient() {
  if (!cfg.secretKey) throw new Error('Stripe secret key is not configured');
  if (!client) {
    const { default: Stripe } = await import('stripe');
    client = new Stripe(cfg.secretKey);
  }
  return client;
}

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND']);
const toMinor = (amount, currency) => (ZERO_DECIMAL.has(currency) ? Math.round(amount) : Math.round(amount * 100));

export const stripeProvider = {
  name: 'stripe',

  async createCheckout({ order, course, user }) {
    const stripe = await getClient();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      client_reference_id: order.id,
      metadata: { orderId: order.id, courseId: course.id, userId: user.id },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: order.currency.toLowerCase(),
            unit_amount: toMinor(order.amount, order.currency),
            product_data: { name: course.title, description: course.shortDescription?.slice(0, 200) || undefined },
          },
        },
      ],
      success_url: `${env.siteUrl}/checkout/return?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.siteUrl}${course.cancelPath || `/checkout/${course.slug}`}?cancelled=1`,
    });
    return { providerOrderId: session.id, clientPayload: { checkoutUrl: session.url } };
  },

  /** Confirms the Checkout Session server-side — the browser redirect alone proves nothing. */
  async verify({ payment }) {
    const stripe = await getClient();
    const session = await stripe.checkout.sessions.retrieve(payment.providerOrderId);
    if (session.payment_status !== 'paid') return { ok: false, pending: session.status === 'open', reason: `Payment ${session.payment_status}` };
    if (session.amount_total !== toMinor(payment.amount, payment.currency)) return { ok: false, reason: 'Amount mismatch' };
    return { ok: true, transactionId: session.payment_intent, method: 'card', raw: { id: session.id } };
  },

  async parseWebhook(rawBody, headers) {
    const stripe = await getClient();
    if (!cfg.webhookSecret) throw new Error('Webhook not configured');
    const event = stripe.webhooks.constructEvent(rawBody, headers['stripe-signature'], cfg.webhookSecret);
    const obj = event.data.object;
    if (event.type === 'checkout.session.completed' && obj.payment_status === 'paid') {
      return { type: 'paid', providerOrderId: obj.id, transactionId: obj.payment_intent, method: 'card' };
    }
    if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      return { type: 'failed', providerOrderId: obj.id, reason: event.type };
    }
    return null;
  },

  async refund({ payment }) {
    const stripe = await getClient();
    const r = await stripe.refunds.create({ payment_intent: payment.transactionId });
    return { refundId: r.id };
  },
};
