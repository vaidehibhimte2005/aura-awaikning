import mongoose from 'mongoose';
import crypto from 'crypto';
import { AttendanceEvent, Booking, Earning, Feedback, Payment, Slot, Subscription, Trainer, UsageRecord, User } from '../models/index.js';
import { ApiError, asyncHandler, created, escapeRegex, getPagination, ok, pageMeta } from '../utils/http.js';
import { uniqueSlug } from '../utils/slugify.js';
import { logActivity } from '../services/activityService.js';
import { notify } from '../services/notificationService.js';
import { assertIdentityFree } from './authController.js';
import { getConfig } from '../services/training/configService.js';
import { resolveBooking, finalizeBooking } from '../services/training/attendanceService.js';
import * as payouts from '../services/training/payoutService.js';
import { trainerHasUpcoming } from '../services/training/slotService.js';

const tempPassword = () => `${crypto.randomBytes(5).toString('hex')}A${Math.floor(10 + Math.random() * 89)}!`;
const rx = (q) => new RegExp(escapeRegex(String(q).slice(0, 60)), 'i');

// ─── Trainers (admin-created only) ────────────────────────
export const listTrainers = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 25 });
  const cfg = await getConfig();
  const userFilter = { role: 'trainer' };
  if (req.query.status === 'active') userFilter.isActive = true;
  if (req.query.status === 'inactive') userFilter.isActive = false;
  if (req.query.q) userFilter.$or = [{ name: rx(req.query.q) }, { email: rx(req.query.q) }];
  const [users, total] = await Promise.all([
    User.find(userFilter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit),
    User.countDocuments(userFilter),
  ]);
  const ids = users.map((u) => u._id);
  const [profiles, earnings, sessions, openSlots] = await Promise.all([
    Trainer.find({ user: { $in: ids } }),
    Earning.aggregate([{ $match: { trainer: { $in: ids } } }, { $group: { _id: { t: '$trainer', s: '$status' }, amount: { $sum: '$amount' } } }]),
    Booking.aggregate([{ $match: { trainer: { $in: ids }, status: 'completed' } }, { $group: { _id: '$trainer', n: { $sum: 1 } } }]),
    Slot.aggregate([{ $match: { trainer: { $in: ids }, status: 'available', active: true, start: { $gte: new Date() } } }, { $group: { _id: '$trainer', n: { $sum: 1 } } }]),
  ]);
  const pBy = new Map(profiles.map((p) => [String(p.user), p]));
  const sBy = new Map(sessions.map((s) => [String(s._id), s.n]));
  const oBy = new Map(openSlots.map((s) => [String(s._id), s.n]));
  const data = users.map((u) => {
    const p = pBy.get(String(u._id));
    const e = Object.fromEntries(earnings.filter((x) => String(x._id.t) === String(u._id)).map((x) => [x._id.s, x.amount]));
    return {
      _id: u._id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      isActive: u.isActive,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      profile: p ? { _id: p._id, title: p.title, shortBio: p.shortBio, bio: p.bio, specialties: p.specialties, languages: p.languages, experienceYears: p.experienceYears, payoutPerSession: p.payoutPerSession, isPublished: p.isPublished } : null,
      effectivePayout: p?.payoutPerSession ?? cfg.trainerPayoutPerSession,
      completedSessions: sBy.get(String(u._id)) || 0,
      openSlots: oBy.get(String(u._id)) || 0,
      earnings: { pending: e.pending || 0, approved: e.approved || 0, paid: e.paid || 0, failed: e.failed || 0 },
    };
  });
  ok(res, data, 200, { ...pageMeta(total, pg), currency: cfg.currency });
});

export const createTrainer = asyncHandler(async (req, res) => {
  const b = req.body;
  await assertIdentityFree({ email: b.email, phone: b.phone });
  const password = b.password || tempPassword();
  let user;
  try {
    // No trainerStatus: an admin-created account is trusted and active immediately.
    user = await User.create({
      name: b.name, email: b.email, phone: b.phone, password, role: 'trainer', emailVerified: true,
      authProviders: [{ provider: 'password' }],
    });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('An account with this email or mobile number already exists');
    throw err;
  }
  const trainer = await Trainer.create({
    user: user._id,
    displayName: b.name,
    slug: await uniqueSlug(Trainer, b.name),
    title: b.title, shortBio: b.shortBio, bio: b.bio, specialties: b.specialties, languages: b.languages,
    experienceYears: b.experienceYears,
    payoutPerSession: b.payoutPerSession ?? null,
    isPublished: true,
  });
  await logActivity({ actor: req.user, action: 'trainer.created', entityType: 'user', entity: user, entityLabel: user.name });
  await notify(user._id, {
    type: 'trainer_account', title: 'Your trainer account is ready',
    message: 'An administrator created your Aura Awakening trainer account. Publish your availability to start receiving bookings.',
    link: '/trainer/slots', related: { type: 'user', id: user._id }, idempotencyKey: `trainer_created:${user._id}`,
  }, { channels: ['email'] });
  // The password is shown to the admin exactly once, only when they did not choose one.
  created(res, { id: user.id, trainerId: trainer.id, email: user.email, temporaryPassword: b.password ? undefined : password });
});

export const updateTrainer = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: 'trainer' }).select('+password');
  if (!user) throw ApiError.notFound('Trainer not found');
  const profile = await Trainer.findOne({ user: user._id });
  const { name, phone, isActive, newPassword, ...profileFields } = req.body;
  let warning;

  if (name !== undefined) { user.name = name; if (profile) profile.displayName = name; }
  if (phone !== undefined) user.phone = phone;
  if (newPassword) { user.password = newPassword; user.refreshTokens = []; }
  if (isActive !== undefined && isActive !== user.isActive) {
    user.isActive = isActive;
    if (profile) profile.isPublished = isActive;
    if (!isActive) {
      // Stop new bookings: withdraw open slots. Existing bookings are left for the admin to handle explicitly.
      await Slot.updateMany({ trainer: user._id, status: 'available', active: true }, { status: 'cancelled', active: false });
      const upcoming = await trainerHasUpcoming(user._id);
      if (upcoming) warning = `${upcoming} upcoming booking(s) still exist for this trainer — cancel or reassign them from Bookings.`;
    }
    await notify(user._id, {
      type: 'trainer_account', title: isActive ? 'Your account was activated' : 'Your account was deactivated',
      message: isActive ? 'You can log in and publish availability again.' : 'You can no longer take bookings. Contact an administrator if this is unexpected.',
      related: { type: 'user', id: user._id }, idempotencyKey: `trainer_active:${user._id}:${isActive}:${Date.now()}`,
    });
    await logActivity({ actor: req.user, action: isActive ? 'trainer.activated' : 'trainer.deactivated', entityType: 'user', entity: user, entityLabel: user.name });
  }
  if (profile) {
    for (const k of ['title', 'shortBio', 'bio', 'specialties', 'languages', 'experienceYears', 'payoutPerSession']) {
      if (profileFields[k] !== undefined) profile[k] = profileFields[k];
    }
    await profile.save();
  }
  try {
    await user.save();
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('That mobile number is already in use');
    throw err;
  }
  if (profileFields.payoutPerSession !== undefined) {
    await logActivity({ actor: req.user, action: 'trainer.payout_rate_changed', entityType: 'user', entity: user, entityLabel: user.name, to: String(profileFields.payoutPerSession) });
  }
  ok(res, { updated: true, warning });
});

// ─── Learners ─────────────────────────────────────────────
export const listLearners = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 25 });
  const filter = { role: 'learner' };
  if (req.query.status === 'active') filter.isActive = true;
  if (req.query.status === 'inactive') filter.isActive = false;
  if (req.query.q) filter.$or = [{ name: rx(req.query.q) }, { email: rx(req.query.q) }, { phone: rx(req.query.q) }];
  const [users, total] = await Promise.all([User.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit), User.countDocuments(filter)]);
  const ids = users.map((u) => u._id);
  const subs = await Subscription.find({ user: { $in: ids } }).sort({ expiresAt: -1 });
  const data = users.map((u) => {
    const mine = subs.filter((s) => String(s.user) === String(u._id));
    const live = mine.filter((s) => s.phase === 'active');
    const cur = live[0] || mine[0];
    return {
      _id: u._id, name: u.name, email: u.email, phone: u.phone, isActive: u.isActive, createdAt: u.createdAt,
      location: u.location, interests: u.interests,
      package: cur ? { name: cur.packageName, phase: cur.phase, expiresAt: cur.expiresAt, startsAt: cur.startsAt, trainingDays: cur.trainingDays, daysUsed: cur.daysUsed, remainingDays: cur.remainingDays } : null,
      remainingDays: live.reduce((n, s) => n + s.remainingDays, 0),
    };
  });
  ok(res, data, 200, pageMeta(total, pg));
});

export const getLearner = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: 'learner' });
  if (!user) throw ApiError.notFound('Learner not found');
  const [subscriptions, bookings, payments] = await Promise.all([
    Subscription.find({ user: user._id }).sort({ createdAt: -1 }),
    Booking.find({ learner: user._id }).sort({ startAt: -1 }).limit(50).populate('trainer', 'name'),
    Payment.find({ user: user._id, package: { $ne: null } }).sort({ createdAt: -1 }).limit(50).populate('package', 'name').populate('order', 'orderNumber'),
  ]);
  ok(res, { user, subscriptions, bookings, payments });
});

export const setLearnerActive = asyncHandler(async (req, res) => {
  const user = await User.findOneAndUpdate({ _id: req.params.id, role: 'learner' }, { isActive: req.body.isActive }, { new: true });
  if (!user) throw ApiError.notFound('Learner not found');
  await logActivity({ actor: req.user, action: req.body.isActive ? 'learner.activated' : 'learner.deactivated', entityType: 'user', entity: user, entityLabel: user.name });
  ok(res, user);
});

export const listSubscriptions = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 25 });
  const now = new Date();
  const filter = {};
  const phase = req.query.phase;
  if (phase === 'active') Object.assign(filter, { status: 'active', expiresAt: { $gt: now }, startsAt: { $lte: now } });
  if (phase === 'expiring') Object.assign(filter, { status: 'active', expiresAt: { $gt: now, $lte: new Date(Date.now() + 7 * 86400000) } });
  if (phase === 'expired') filter.$or = [{ status: 'expired' }, { status: 'active', expiresAt: { $lte: now } }];
  if (phase === 'cancelled') filter.status = 'cancelled';
  const [items, total] = await Promise.all([
    Subscription.find(filter).sort({ expiresAt: 1 }).skip(pg.skip).limit(pg.limit).populate('user', 'name email'),
    Subscription.countDocuments(filter),
  ]);
  ok(res, items, 200, pageMeta(total, pg));
});

export const cancelSubscription = asyncHandler(async (req, res) => {
  const sub = await Subscription.findOneAndUpdate(
    { _id: req.params.id, status: { $ne: 'cancelled' } },
    { status: 'cancelled', cancelledAt: new Date(), cancelReason: req.body.reason || 'Cancelled by administrator' },
    { new: true },
  );
  if (!sub) throw ApiError.notFound('Active subscription not found');
  await logActivity({ actor: req.user, action: 'subscription.cancelled', entityType: 'subscription', entity: sub, entityLabel: sub.packageName, reason: req.body.reason });
  await notify(sub.user, { type: 'package', title: 'Package cancelled', message: `${sub.packageName} was cancelled by an administrator.`, link: '/dashboard/plans', related: { type: 'subscription', id: sub._id }, idempotencyKey: `pkg_cancelled:${sub._id}` });
  ok(res, sub);
});

// ─── Bookings, attendance, resolution ─────────────────────
export const listBookings = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 25 });
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.trainer && /^[a-f\d]{24}$/i.test(req.query.trainer)) filter.trainer = req.query.trainer;
  if (req.query.learner && /^[a-f\d]{24}$/i.test(req.query.learner)) filter.learner = req.query.learner;
  if (req.query.from || req.query.to) {
    filter.startAt = {};
    if (req.query.from) filter.startAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.startAt.$lte = new Date(req.query.to);
  }
  const [items, total] = await Promise.all([
    Booking.find(filter).sort({ startAt: -1 }).skip(pg.skip).limit(pg.limit)
      .populate('learner', 'name email').populate('trainer', 'name').populate('subscription', 'packageName'),
    Booking.countDocuments(filter),
  ]);
  ok(res, items, 200, pageMeta(total, pg));
});

export const resolve = asyncHandler(async (req, res) => {
  const booking = await resolveBooking({ bookingId: req.params.id, admin: req.user, action: req.body.action, note: req.body.note });
  await logActivity({ actor: req.user, action: `booking.resolved.${req.body.action}`, entityType: 'booking', entity: booking, entityLabel: String(booking._id), reason: req.body.note });
  ok(res, { status: booking.status });
});

/** Forces the policy check now (e.g. after attendance data arrives late). */
export const reevaluate = asyncHandler(async (req, res) => {
  const booking = await finalizeBooking(req.params.id, { force: true });
  if (!booking) throw ApiError.notFound('Booking not found');
  ok(res, { status: booking.status });
});

/** The audit trail linking booking → attendance → learner usage → trainer earning. */
export const sessionReport = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 25 });
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.trainer && /^[a-f\d]{24}$/i.test(req.query.trainer)) filter.trainer = req.query.trainer;
  if (req.query.from || req.query.to) {
    filter.startAt = {};
    if (req.query.from) filter.startAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.startAt.$lte = new Date(`${req.query.to}T23:59:59.999Z`);
  }
  const [bookings, total] = await Promise.all([
    Booking.find(filter).sort({ startAt: -1 }).skip(pg.skip).limit(pg.limit)
      .populate('learner', 'name email').populate('trainer', 'name').populate('subscription', 'packageName'),
    Booking.countDocuments(filter),
  ]);
  const ids = bookings.map((b) => b._id);
  const [usage, earnings, events] = await Promise.all([
    UsageRecord.find({ booking: { $in: ids } }),
    Earning.find({ booking: { $in: ids } }),
    AttendanceEvent.find({ booking: { $in: ids } }).sort({ at: 1 }).select('booking role type at source'),
  ]);
  const uBy = new Map(usage.map((u) => [String(u.booking), u]));
  const eBy = new Map(earnings.map((e) => [String(e.booking), e]));
  const data = bookings.map((b) => ({
    ...b.toObject(),
    meeting: { provider: b.meeting?.provider, isDemo: b.meeting?.isDemo },
    usage: uBy.get(String(b._id)) ? { dayKey: uBy.get(String(b._id)).dayKey, counted: true } : { counted: false },
    earning: eBy.get(String(b._id)) ? { _id: eBy.get(String(b._id))._id, amount: eBy.get(String(b._id)).amount, status: eBy.get(String(b._id)).status } : null,
    events: events.filter((e) => String(e.booking) === String(b._id)),
  }));
  ok(res, data, 200, pageMeta(total, pg));
});

export const overview = asyncHandler(async (_req, res) => {
  const cfg = await getConfig();
  const now = new Date();
  const weekAhead = new Date(Date.now() + 7 * 86400000);
  const [revenue, learners, trainers, activeSubs, expiring, upcoming, review, completed, payoutAgg, recentPayments] = await Promise.all([
    Payment.aggregate([{ $match: { status: 'paid', package: { $ne: null } } }, { $group: { _id: null, total: { $sum: '$amount' }, n: { $sum: 1 } } }]),
    User.countDocuments({ role: 'learner' }),
    User.countDocuments({ role: 'trainer', isActive: true }),
    Subscription.countDocuments({ status: 'active', expiresAt: { $gt: now }, startsAt: { $lte: now } }),
    Subscription.countDocuments({ status: 'active', expiresAt: { $gt: now, $lte: weekAhead } }),
    Booking.countDocuments({ status: 'confirmed', startAt: { $gt: now } }),
    Booking.countDocuments({ status: 'needs_review' }),
    Booking.countDocuments({ status: 'completed' }),
    Earning.aggregate([{ $group: { _id: '$status', amount: { $sum: '$amount' }, n: { $sum: 1 } } }]),
    Payment.find({ package: { $ne: null } }).sort({ createdAt: -1 }).limit(6).populate('user', 'name').populate('package', 'name'),
  ]);
  const pay = Object.fromEntries(payoutAgg.map((p) => [p._id, { amount: p.amount, count: p.n }]));
  ok(res, {
    currency: cfg.currency,
    revenue: revenue[0]?.total || 0,
    paidOrders: revenue[0]?.n || 0,
    learners, trainers, activeSubscriptions: activeSubs, expiringSoon: expiring,
    upcomingBookings: upcoming, needsReview: review, completedSessions: completed,
    payouts: pay,
    recentPayments,
  });
});

// ─── Payments (package orders) ────────────────────────────
export const listPackagePayments = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 25 });
  const filter = { package: { $ne: null } };
  if (req.query.status) filter.status = String(req.query.status);
  const [items, total, totals] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit)
      .populate('user', 'name email').populate('package', 'name').populate('order', 'orderNumber pricing purchaseMode'),
    Payment.countDocuments(filter),
    Payment.aggregate([{ $match: { ...filter, status: 'paid' } }, { $group: { _id: '$currency', revenue: { $sum: '$amount' } } }]),
  ]);
  ok(res, items, 200, { ...pageMeta(total, pg), revenue: totals });
});

// ─── Payouts ──────────────────────────────────────────────
export const listPayouts = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 30 });
  const filter = {};
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.trainer && /^[a-f\d]{24}$/i.test(req.query.trainer)) filter.trainer = req.query.trainer;
  const [items, total, totals] = await Promise.all([
    Earning.find(filter).sort({ sessionAt: -1 }).skip(pg.skip).limit(pg.limit)
      .populate('trainer', 'name email').populate('learner', 'name').populate('booking', 'startAt durationMin status'),
    Earning.countDocuments(filter),
    Earning.aggregate([{ $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
  ]);
  ok(res, items, 200, { ...pageMeta(total, pg), totals: Object.fromEntries(totals.map((t) => [t._id, { amount: t.amount, count: t.count }])) });
});

export const approvePayouts = asyncHandler(async (req, res) => ok(res, await payouts.approve(req.body.ids, req.user)));
export const payPayouts = asyncHandler(async (req, res) => ok(res, await payouts.markPaid(req.body.ids, req.user, req.body.reference || '')));
export const failPayouts = asyncHandler(async (req, res) => ok(res, await payouts.markFailed(req.body.ids, req.user, req.body.reason || '')));
export const reopenPayouts = asyncHandler(async (req, res) => ok(res, await payouts.reopen(req.body.ids, req.user)));


// ─── Learner feedback ─────────────────────────────────────
export const listFeedback = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 25 });
  const filter = {};
  if (req.query.trainer && /^[a-f\d]{24}$/i.test(req.query.trainer)) filter.trainer = req.query.trainer;
  if (req.query.rating) filter.rating = Number(req.query.rating);
  if (req.query.q) filter.comment = rx(req.query.q);
  const [items, total, agg] = await Promise.all([
    Feedback.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit)
      .populate('learner', 'name email').populate('trainer', 'name').populate('booking', 'startAt'),
    Feedback.countDocuments(filter),
    Feedback.aggregate([
      { $match: { ...filter, ...(filter.trainer ? { trainer: new mongoose.Types.ObjectId(filter.trainer) } : {}) } },
      { $group: { _id: null, avg: { $avg: '$rating' } } },
    ]),
  ]);
  ok(res, items, 200, { ...pageMeta(total, pg), average: agg[0] ? Math.round(agg[0].avg * 10) / 10 : null });
});
