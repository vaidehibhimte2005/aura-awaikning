import crypto from 'crypto';
import { Course, Enrollment, Order, Package, Payment, Subscription } from '../models/index.js';
import { ApiError } from '../utils/http.js';
import { env } from '../config/env.js';
import { getProvider, activeProviderName } from './payments/index.js';
import { enrollUser } from './learningService.js';
import { notify, staffIds } from './notificationService.js';
import { getConfig } from './training/configService.js';
import { computePrice } from './training/pricingService.js';
import { activateFromOrder, resolvePurchaseMode } from './training/subscriptionService.js';

const orderNumber = () =>
  `AA${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

/**
 * Step 1 — create Order + Payment and a provider checkout.
 * The price always comes from the database, never from the client.
 */
export async function createCheckout({ user, courseId }) {
  const course = await Course.findOne({ _id: courseId, status: 'published' });
  if (!course) throw ApiError.notFound('Course not found');
  if (!course.price) throw ApiError.badRequest('This course is free — enroll directly');

  const already = await Enrollment.exists({ user: user._id, course: course._id, status: { $ne: 'revoked' } });
  if (already) throw ApiError.conflict('You are already enrolled in this course');

  const providerName = activeProviderName();
  const provider = getProvider(providerName);
  const order = await Order.create({
    orderNumber: orderNumber(),
    user: user._id,
    course: course._id,
    amount: course.price,
    currency: course.currency || env.payments.currency,
    provider: providerName,
  });

  let checkout;
  try {
    checkout = await provider.createCheckout({ order, course, user });
  } catch (err) {
    order.status = 'failed';
    order.failureReason = err.message;
    await order.save();
    throw new ApiError(502, `Could not start payment: ${err.message}`);
  }

  order.providerOrderId = checkout.providerOrderId;
  order.status = 'pending';
  await order.save();
  await Payment.create({
    order: order._id,
    user: user._id,
    course: course._id,
    amount: order.amount,
    currency: order.currency,
    provider: providerName,
    providerOrderId: checkout.providerOrderId,
    status: 'pending',
  });

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    provider: providerName,
    amount: order.amount,
    currency: order.currency,
    course: { id: course.id, title: course.title, slug: course.slug },
    ...checkout.clientPayload,
  };
}

/**
 * Checkout for a training package. The amount is computed here from the admin's current
 * daily rate and the package's discount — nothing price-related is accepted from the client.
 */
export async function createPackageCheckout({ user, packageId, mode }) {
  const pkg = await Package.findOne({ _id: packageId, isActive: true });
  if (!pkg) throw ApiError.notFound('This plan is not available');
  const cfg = await getConfig();
  const price = computePrice(pkg, cfg);
  if (price.amount <= 0) throw ApiError.badRequest('This plan has no payable amount.');
  const purchase = await resolvePurchaseMode({ userId: user._id, pkg, requested: mode });

  const providerName = activeProviderName();
  const provider = getProvider(providerName);
  const order = await Order.create({
    orderNumber: orderNumber(),
    kind: 'package',
    user: user._id,
    package: pkg._id,
    purchaseMode: purchase.mode,
    pricing: { dailyRate: price.dailyRate, baseAmount: price.baseAmount, discount: price.discount, amount: price.amount, trainingDays: pkg.trainingDays, validityDays: pkg.validityDays },
    amount: price.amount,
    currency: cfg.currency,
    provider: providerName,
  });
  let checkout;
  try {
    checkout = await provider.createCheckout({
      order,
      course: { id: pkg.id, title: pkg.name, slug: '', cancelPath: '/dashboard/plans', shortDescription: pkg.description },
      user,
    });
  } catch (err) {
    order.status = 'failed';
    order.failureReason = err.message;
    await order.save();
    throw new ApiError(502, `Could not start payment: ${err.message}`);
  }
  order.providerOrderId = checkout.providerOrderId;
  order.status = 'pending';
  await order.save();
  await Payment.create({
    order: order._id,
    user: user._id,
    package: pkg._id,
    amount: order.amount,
    currency: order.currency,
    provider: providerName,
    providerOrderId: checkout.providerOrderId,
    status: 'pending',
  });
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    provider: providerName,
    amount: order.amount,
    currency: order.currency,
    mode: purchase.mode,
    package: { id: pkg.id, name: pkg.name, ...price },
    ...checkout.clientPayload,
  };
}

/** Grants whatever the order paid for. Idempotent — safe to call from verify, webhook and the reconciler. */
export async function fulfilOrder(order) {
  if (order.kind === 'package') return activateFromOrder(order);
  return enrollUser({ userId: order.user, courseId: order.course, source: 'purchase', orderId: order._id });
}

/** Marks payment+order paid and enrolls. Idempotent (safe for webhook + client verify racing). */
async function finalizePaid(payment, { transactionId, method, raw, via }) {
  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $ne: 'paid' } },
    { status: 'paid', transactionId, method, paidAt: new Date(), verifiedVia: via, raw },
    { new: true },
  );
  const order = await Order.findById(payment.order);
  if (!claimed) {
    // A previous attempt may have crashed after marking paid but before granting access.
    if (order.status === 'paid') await fulfilOrder(order);
    return { order, alreadyProcessed: true };
  }

  order.status = 'paid';
  order.paidAt = new Date();
  await order.save();
  await fulfilOrder(order);
  await notify(order.user, {
    type: 'payment_success',
    title: 'Payment received',
    message: `Thank you — order ${order.orderNumber} is confirmed.`,
    link: order.kind === 'package' ? '/dashboard/plans' : '/dashboard/payments',
    related: { type: 'order', id: order._id },
    idempotencyKey: `payment_success:${order._id}:learner`,
  }, { channels: ['email'] });
  await notify(await staffIds(['admin']), {
    type: 'payment_success',
    title: 'Payment confirmed',
    message: `Order ${order.orderNumber} — ${order.currency} ${order.amount} (${order.provider}).`,
    link: '/admin/payments',
    related: { type: 'order', id: order._id },
    idempotencyKey: `payment_success:${order._id}:admin`,
  });
  return { order, alreadyProcessed: false };
}

async function markFailed(payment, reason) {
  if (payment.status === 'paid') return;
  payment.status = 'failed';
  payment.failureReason = reason;
  await payment.save();
  await Order.updateOne({ _id: payment.order, status: { $ne: 'paid' } }, { status: 'failed', failureReason: reason });
}

/** Step 2 — verify on the server using the provider's signature / API. */
export async function verifyPayment({ user, orderId, payload }) {
  const order = await Order.findOne({ _id: orderId, user: user._id });
  if (!order) throw ApiError.notFound('Order not found');
  const payment = await Payment.findOne({ order: order._id, providerOrderId: order.providerOrderId });
  if (!payment) throw ApiError.notFound('Payment not found');
  if (payment.status === 'paid') {
    if (order.status === 'paid') await fulfilOrder(order);
    return { status: 'paid', orderId: order.id };
  }

  const provider = getProvider(payment.provider);
  const result = await provider.verify({ payment, payload });
  if (!result.ok) {
    if (result.pending) return { status: 'pending', orderId: order.id };
    await markFailed(payment, result.reason);
    await notify(user._id, {
      type: 'payment_failed',
      title: 'Payment was not completed',
      message: result.reason || 'Your payment could not be verified. No enrollment was created.',
      link: '/dashboard/payments',
      related: { type: 'order', id: order._id },
      idempotencyKey: `payment_failed:${order._id}:learner`,
    });
    await notify(await staffIds(['admin']), {
      type: 'payment_failed',
      title: 'Payment failed',
      message: `Order ${order.orderNumber}: ${result.reason || 'verification failed'}.`,
      link: '/admin/payments',
      related: { type: 'order', id: order._id },
      idempotencyKey: `payment_failed:${order._id}:admin`,
    });
    throw ApiError.badRequest(result.reason || 'Payment verification failed');
  }
  await finalizePaid(payment, { ...result, via: 'client_verify' });
  return { status: 'paid', orderId: order.id };
}

export async function reportFailure({ user, orderId, reason }) {
  const order = await Order.findOne({ _id: orderId, user: user._id });
  if (!order) throw ApiError.notFound('Order not found');
  const payment = await Payment.findOne({ order: order._id, providerOrderId: order.providerOrderId });
  if (payment) await markFailed(payment, reason || 'Cancelled by user');
  return { status: 'failed' };
}

export async function handleWebhook(providerName, rawBody, headers) {
  const provider = getProvider(providerName);
  const evt = await provider.parseWebhook(rawBody, headers);
  if (!evt) return { ignored: true };
  const payment = await Payment.findOne({ provider: providerName, providerOrderId: evt.providerOrderId });
  if (!payment) return { ignored: true };
  if (evt.type === 'paid') {
    await finalizePaid(payment, { transactionId: evt.transactionId, method: evt.method, via: 'webhook' });
  } else if (evt.type === 'failed') {
    await markFailed(payment, evt.reason);
  }
  return { processed: true };
}

export async function refundPayment(paymentId) {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw ApiError.notFound('Payment not found');
  if (payment.status !== 'paid') throw ApiError.badRequest('Only paid payments can be refunded');
  const provider = getProvider(payment.provider);
  const { refundId } = await provider.refund({ payment });
  payment.status = 'refunded';
  payment.refundId = refundId;
  payment.refundedAt = new Date();
  await payment.save();
  await Order.updateOne({ _id: payment.order }, { status: 'refunded' });
  if (payment.package) await Subscription.updateMany({ order: payment.order, status: 'active' }, { status: 'cancelled', cancelledAt: new Date(), cancelReason: 'Payment refunded' });
  else await Enrollment.updateOne({ user: payment.user, course: payment.course }, { status: 'revoked' });
  const refund = { type: 'refund', related: { type: 'payment', id: payment._id } };
  await notify(payment.user, { ...refund, title: 'Refund processed', message: 'Your payment was refunded and the access it bought was removed.', link: '/dashboard/payments', idempotencyKey: `refund:${payment._id}:learner` });
  await notify(await staffIds(['admin']), { ...refund, title: 'Refund issued', message: `Payment ${payment.id} was refunded.`, link: '/admin/payments', idempotencyKey: `refund:${payment._id}:admin` });
  return payment;
}
