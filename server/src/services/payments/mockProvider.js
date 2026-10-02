import crypto from 'crypto';
import { env } from '../../config/env.js';

/**
 * Development-only provider so the full checkout → verify → enroll flow can
 * be exercised without real keys. The server signs a one-time token and the
 * verify step checks it, mirroring how Razorpay's signature check works.
 * Automatically refused when NODE_ENV=production.
 */
const sign = (providerOrderId) =>
  crypto.createHmac('sha256', env.jwt.secret).update(`mock|${providerOrderId}`).digest('hex');

export const mockProvider = {
  name: 'mock',

  async createCheckout({ order }) {
    const providerOrderId = `mock_${crypto.randomBytes(8).toString('hex')}`;
    return {
      providerOrderId,
      clientPayload: { mockToken: sign(providerOrderId), amount: order.amount, currency: order.currency },
    };
  },

  async verify({ payment, payload }) {
    if (payload?.simulate === 'fail') return { ok: false, reason: 'Simulated failure' };
    if (payload?.mockToken !== sign(payment.providerOrderId)) return { ok: false, reason: 'Invalid mock token' };
    return { ok: true, transactionId: `mock_txn_${crypto.randomBytes(8).toString('hex')}`, method: 'mock' };
  },

  parseWebhook() {
    return null;
  },

  async refund() {
    return { refundId: `mock_rfnd_${crypto.randomBytes(6).toString('hex')}` };
  },
};
