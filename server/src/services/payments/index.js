import { env } from '../../config/env.js';
import { razorpayProvider } from './razorpayProvider.js';
import { stripeProvider } from './stripeProvider.js';
import { mockProvider } from './mockProvider.js';

/**
 * Provider registry. To add PayPal / Cashfree / PhonePe, create a module with
 * the same interface — createCheckout, verify, parseWebhook, refund — and
 * register it here. Nothing else in the app needs to change.
 */
const providers = {
  razorpay: razorpayProvider,
  stripe: stripeProvider,
  ...(env.isProd ? {} : { mock: mockProvider }),
};

export function getProvider(name = env.payments.provider) {
  const provider = providers[name];
  if (!provider) throw Object.assign(new Error(`Payment provider "${name}" is not available`), { status: 400 });
  return provider;
}

export const activeProviderName = () => env.payments.provider;
