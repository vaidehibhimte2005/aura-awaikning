import crypto from 'crypto';
import { env } from '../../config/env.js';

const cfg = env.payments.razorpay;
let client;

async function getClient() {
  if (!cfg.keyId || !cfg.keySecret) throw new Error('Razorpay keys are not configured');
  if (!client) {
    const { default: Razorpay } = await import('razorpay');
    client = new Razorpay({ key_id: cfg.keyId, key_secret: cfg.keySecret });
  }
  return client;
}

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

export const razorpayProvider = {
  name: 'razorpay',

  async createCheckout({ order, course, user }) {
    const rzp = await getClient();
    const rOrder = await rzp.orders.create({
      amount: Math.round(order.amount * 100), // paise
      currency: order.currency,
      receipt: order.orderNumber,
      notes: { orderId: order.id, courseId: course.id, userId: user.id },
    });
    return {
      providerOrderId: rOrder.id,
      // Only the *public* key id is ever sent to the browser.
      clientPayload: {
        keyId: cfg.keyId,
        razorpayOrderId: rOrder.id,
        amount: rOrder.amount,
        currency: rOrder.currency,
        name: 'Aura Awakening',
        description: course.title,
        prefill: { name: user.name, email: user.email },
      },
    };
  },

  /** Verifies the checkout handler response: HMAC_SHA256(order_id|payment_id, key_secret). */
  async verify({ payment, payload }) {
    const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig } = payload || {};
    if (!oid || !pid || !sig) return { ok: false, reason: 'Missing payment fields' };
    if (oid !== payment.providerOrderId) return { ok: false, reason: 'Order mismatch' };
    const expected = crypto.createHmac('sha256', cfg.keySecret).update(`${oid}|${pid}`).digest('hex');
    if (!safeEqual(expected, sig)) return { ok: false, reason: 'Signature verification failed' };
    // Defence in depth: confirm captured amount with Razorpay.
    const rzp = await getClient();
    const p = await rzp.payments.fetch(pid);
    if (Number(p.amount) !== Math.round(payment.amount * 100)) return { ok: false, reason: 'Amount mismatch' };
    if (!['captured', 'authorized'].includes(p.status)) return { ok: false, reason: `Payment ${p.status}` };
    return { ok: true, transactionId: pid, method: p.method, raw: { id: p.id, status: p.status } };
  },

  /** Webhook: verify X-Razorpay-Signature over the raw body. */
  parseWebhook(rawBody, headers) {
    const sig = headers['x-razorpay-signature'];
    if (!cfg.webhookSecret || !sig) throw new Error('Webhook not configured');
    const expected = crypto.createHmac('sha256', cfg.webhookSecret).update(rawBody).digest('hex');
    if (!safeEqual(expected, sig)) throw new Error('Invalid webhook signature');
    const event = JSON.parse(rawBody.toString('utf8'));
    const entity = event.payload?.payment?.entity;
    if (!entity) return null;
    if (event.event === 'payment.captured') {
      return { type: 'paid', providerOrderId: entity.order_id, transactionId: entity.id, method: entity.method };
    }
    if (event.event === 'payment.failed') {
      return { type: 'failed', providerOrderId: entity.order_id, reason: entity.error_description };
    }
    return null;
  },

  async refund({ payment }) {
    const rzp = await getClient();
    const r = await rzp.payments.refund(payment.transactionId, { amount: Math.round(payment.amount * 100) });
    return { refundId: r.id };
  },
};
