import { Booking, Package, Subscription, UsageRecord } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { addDays } from '../../utils/time.js';
import { notify, staffIds } from '../notificationService.js';
import { getConfig } from './configService.js';

const DAY = 86400000;

export const liveSubscriptionsFilter = (userId, now = new Date()) => ({
  user: userId,
  status: 'active',
  expiresAt: { $gt: now },
});

/**
 * Decides whether this learner may buy `pkg` right now, and in which mode.
 *  - no live package                         → "new"
 *  - live package nearly used up / expiring  → "renew"  (starts when the current one ends)
 *  - live package, bigger plan requested     → "upgrade" (starts immediately, alongside)
 * Anything else is rejected so learners don't accidentally stack duplicate plans.
 */
export async function resolvePurchaseMode({ userId, pkg, requested }) {
  const cfg = await getConfig();
  const now = new Date();
  const live = await Subscription.find(liveSubscriptionsFilter(userId, now)).sort({ expiresAt: -1 });
  if (!live.length) return { mode: 'new', startsAt: now };

  const latestEnd = live[0].expiresAt;
  const remaining = live.reduce((s, x) => s + Math.max(0, x.trainingDays - x.daysUsed), 0);
  const daysLeft = (latestEnd - now) / DAY;
  const renewable = remaining <= cfg.renewal.remainingDays || daysLeft <= cfg.renewal.windowDays;
  const biggest = Math.max(...live.map((x) => x.trainingDays));
  const upgradable = pkg.trainingDays > biggest;

  if (requested === 'upgrade') {
    if (!upgradable) throw ApiError.badRequest('An upgrade must include more training days than your current package.');
    return { mode: 'upgrade', startsAt: now };
  }
  if (requested === 'renew' || !requested) {
    if (renewable) return { mode: 'renew', startsAt: new Date(Math.max(now.getTime(), latestEnd.getTime())) };
    if (upgradable && !requested) return { mode: 'upgrade', startsAt: now };
  }
  throw ApiError.conflict(
    `You still have an active package (${remaining} training day${remaining === 1 ? '' : 's'} left, valid until ${latestEnd.toDateString()}). You can renew when ${cfg.renewal.remainingDays} day(s) remain or within ${cfg.renewal.windowDays} days of expiry, or upgrade to a larger plan.`,
  );
}

/** Creates the subscription for a PAID order. Idempotent: the unique `order` index guarantees one per order. */
export async function activateFromOrder(order) {
  const existing = await Subscription.findOne({ order: order._id });
  if (existing) return existing;
  const pkg = await Package.findById(order.package);
  const p = order.pricing || {};
  const trainingDays = p.trainingDays || pkg?.trainingDays;
  const validityDays = p.validityDays || pkg?.validityDays;
  const { startsAt } = await resolveStart(order);
  let sub;
  try {
    sub = await Subscription.create({
      user: order.user,
      package: pkg?._id,
      packageName: pkg?.name || 'Training package',
      planKind: pkg?.kind || 'custom',
      order: order._id,
      purchaseMode: order.purchaseMode || 'new',
      trainingDays,
      validityDays,
      startsAt,
      expiresAt: addDays(startsAt, validityDays),
      pricing: { dailyRate: p.dailyRate, baseAmount: p.baseAmount, discount: p.discount, amount: order.amount, currency: order.currency },
    });
  } catch (err) {
    if (err.code === 11000) return Subscription.findOne({ order: order._id });
    throw err;
  }
  const upcoming = sub.startsAt > new Date();
  await notify(order.user, {
    type: 'package',
    title: 'Your package is active',
    message: `${sub.packageName}: ${sub.trainingDays} training day${sub.trainingDays === 1 ? '' : 's'}, ${upcoming ? `starting ${sub.startsAt.toDateString()}, ` : ''}valid until ${sub.expiresAt.toDateString()}. Book your first session now.`,
    link: '/dashboard/book',
    related: { type: 'subscription', id: sub._id },
    idempotencyKey: `package_active:${sub._id}`,
  }, { channels: ['email'] });
  await notify(await staffIds(['admin']), {
    type: 'package',
    title: 'New package purchased',
    message: `${sub.packageName} — ${order.currency} ${order.amount}.`,
    link: '/admin/subscriptions',
    related: { type: 'subscription', id: sub._id },
    idempotencyKey: `package_active_admin:${sub._id}`,
  });
  return sub;
}

async function resolveStart(order) {
  const now = new Date();
  if (order.purchaseMode !== 'renew') return { startsAt: now };
  const latest = await Subscription.findOne(liveSubscriptionsFilter(order.user, now)).sort({ expiresAt: -1 });
  return { startsAt: latest ? new Date(Math.max(now.getTime(), latest.expiresAt.getTime())) : now };
}

/** Keeps the cached counters in sync with the usage ledger (idempotent — safe to re-run any time). */
export async function recomputeCounters(subscriptionId) {
  const [daysUsed, sessionsCompleted] = await Promise.all([
    UsageRecord.countDocuments({ subscription: subscriptionId }),
    Booking.countDocuments({ subscription: subscriptionId, status: 'completed' }),
  ]);
  await Subscription.updateOne({ _id: subscriptionId }, { daysUsed, sessionsCompleted });
}

export async function summaryFor(userId) {
  const subs = await Subscription.find({ user: userId }).sort({ createdAt: -1 }).limit(50);
  const live = subs.filter((s) => ['active', 'exhausted', 'upcoming'].includes(s.phase));
  const usable = live.filter((s) => s.phase === 'active');
  return {
    subscriptions: subs,
    current: usable.sort((a, b) => a.expiresAt - b.expiresAt)[0] || live[0] || null,
    remainingDays: usable.reduce((n, s) => n + s.remainingDays, 0),
    availableToBook: usable.reduce((n, s) => n + s.availableToBook, 0),
  };
}
