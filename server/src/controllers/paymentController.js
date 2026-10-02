import { Order, Payment } from '../models/index.js';
import { asyncHandler, created, escapeRegex, getPagination, ok, pageMeta, ApiError } from '../utils/http.js';
import * as paymentService from '../services/paymentService.js';
import { activeProviderName } from '../services/payments/index.js';

export const config = asyncHandler(async (_req, res) => {
  ok(res, { provider: activeProviderName() });
});

export const checkout = asyncHandler(async (req, res) => {
  created(res, await paymentService.createCheckout({ user: req.user, courseId: req.body.courseId }));
});

export const verify = asyncHandler(async (req, res) => {
  ok(res, await paymentService.verifyPayment({ user: req.user, orderId: req.body.orderId, payload: req.body.payload || {} }));
});

export const fail = asyncHandler(async (req, res) => {
  ok(res, await paymentService.reportFailure({ user: req.user, orderId: req.body.orderId, reason: req.body.reason }));
});

/** Raw-body webhook endpoint: /api/payments/webhook/:provider */
export const webhook = asyncHandler(async (req, res) => {
  try {
    const result = await paymentService.handleWebhook(req.params.provider, req.body, req.headers);
    ok(res, result);
  } catch (err) {
    throw ApiError.badRequest(`Webhook rejected: ${err.message}`);
  }
});

export const myPayments = asyncHandler(async (req, res) => {
  const items = await Payment.find({ user: req.user._id })
    .populate('course', 'title slug')
    .populate('order', 'orderNumber')
    .sort({ createdAt: -1 })
    .limit(100);
  ok(res, items);
});

export const getMyOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id }).populate('course', 'title slug');
  if (!order) throw ApiError.notFound('Order not found');
  ok(res, order);
});

// ─── Admin ────────────────────────────────────────────────
export const listPayments = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 25 });
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.provider) filter.provider = String(req.query.provider);
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 60)), 'i');
    filter.$or = [{ transactionId: rx }, { providerOrderId: rx }];
  }
  const [items, total, totals] = await Promise.all([
    Payment.find(filter)
      .populate('user', 'name email')
      .populate('course', 'title')
      .populate('order', 'orderNumber')
      .sort({ createdAt: -1 })
      .skip(pg.skip)
      .limit(pg.limit),
    Payment.countDocuments(filter),
    Payment.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: '$currency', revenue: { $sum: '$amount' } } }]),
  ]);
  ok(res, items, 200, { ...pageMeta(total, pg), revenue: totals });
});

export const listOrders = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 25 });
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.q) filter.orderNumber = new RegExp(escapeRegex(String(req.query.q).slice(0, 40)), 'i');
  const [items, total] = await Promise.all([
    Order.find(filter).populate('user', 'name email').populate('course', 'title').sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit),
    Order.countDocuments(filter),
  ]);
  ok(res, items, 200, pageMeta(total, pg));
});

export const refund = asyncHandler(async (req, res) => {
  ok(res, await paymentService.refundPayment(req.params.id));
});
