import { AttendanceEvent, Booking, Earning, Feedback, Package, Payment, Slot, Trainer, User } from '../models/index.js';
import { ApiError, asyncHandler, created, getPagination, ok, pageMeta } from '../utils/http.js';
import { logActivity } from '../services/activityService.js';
import { createPackageCheckout } from '../services/paymentService.js';
import { activeProviderName } from '../services/payments/index.js';
import { meetingProviderInfo, zoomProvider } from '../services/meetings/index.js';
import { getConfig, updateConfig } from '../services/training/configService.js';
import { listPricedPackages, presentPackage } from '../services/training/pricingService.js';
import { summaryFor } from '../services/training/subscriptionService.js';
import { browseSlots, deleteSlot, publishSlots, trainersWithAvailability } from '../services/training/slotService.js';
import { bookSlot, cancelBooking, rescheduleBooking } from '../services/training/bookingService.js';
import { recordDemoAttendance, recordProviderEvent, roleInBooking } from '../services/training/attendanceService.js';

// ─── Packages & settings ──────────────────────────────────
export const publicPackages = asyncHandler(async (_req, res) => {
  const cfg = await getConfig();
  const data = await listPricedPackages();
  ok(res, { ...data, config: { ...data.config, cancelCutoffHours: cfg.booking.cancelCutoffHours, timezone: cfg.timezone } });
});

export const adminListPackages = asyncHandler(async (_req, res) => ok(res, await listPricedPackages({ includeInactive: true })));

export const createPackage = asyncHandler(async (req, res) => {
  try {
    const pkg = await Package.create(req.body);
    await logActivity({ actor: req.user, action: 'package.created', entityType: 'package', entity: pkg, entityLabel: pkg.name });
    created(res, presentPackage(pkg, await getConfig()));
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('A package with that code already exists');
    throw err;
  }
});

export const updatePackage = asyncHandler(async (req, res) => {
  const pkg = await Package.findById(req.params.id);
  if (!pkg) throw ApiError.notFound('Package not found');
  Object.assign(pkg, req.body);
  if (pkg.discountType === 'percent' && pkg.discountValue > 100) throw ApiError.badRequest('A percentage discount cannot exceed 100');
  if (pkg.validityDays < pkg.trainingDays) throw ApiError.badRequest('Validity cannot be shorter than the number of training days');
  await pkg.save();
  await logActivity({ actor: req.user, action: 'package.updated', entityType: 'package', entity: pkg, entityLabel: pkg.name });
  ok(res, presentPackage(pkg, await getConfig()));
});

/** Packages that were ever bought are only deactivated; unused ones can be removed. */
export const deletePackage = asyncHandler(async (req, res) => {
  const pkg = await Package.findById(req.params.id);
  if (!pkg) throw ApiError.notFound('Package not found');
  const bought = await Payment.exists({ package: pkg._id });
  if (bought) {
    pkg.isActive = false;
    await pkg.save();
  } else {
    await pkg.deleteOne();
  }
  await logActivity({ actor: req.user, action: bought ? 'package.deactivated' : 'package.deleted', entityType: 'package', entity: pkg, entityLabel: pkg.name });
  ok(res, { deleted: !bought, deactivated: !!bought });
});

export const getTrainingConfig = asyncHandler(async (_req, res) => {
  const cfg = await getConfig({ fresh: true });
  ok(res, { config: cfg, payments: { provider: activeProviderName() }, meetings: meetingProviderInfo() });
});

export const putTrainingConfig = asyncHandler(async (req, res) => {
  const before = await getConfig({ fresh: true });
  const cfg = await updateConfig(req.body);
  await logActivity({
    actor: req.user, action: 'config.updated', entityType: 'config', entityLabel: 'Training settings',
    from: JSON.stringify({ dailyRate: before.dailyRate, payout: before.trainerPayoutPerSession }),
    to: JSON.stringify({ dailyRate: cfg.dailyRate, payout: cfg.trainerPayoutPerSession }),
  });
  ok(res, cfg);
});

// ─── Learner: subscriptions ───────────────────────────────
export const mySubscriptions = asyncHandler(async (req, res) => {
  const s = await summaryFor(req.user._id);
  ok(res, s);
});

export const checkoutPackage = asyncHandler(async (req, res) => {
  created(res, await createPackageCheckout({ user: req.user, packageId: req.body.packageId, mode: req.body.mode }));
});

// ─── Slots ────────────────────────────────────────────────
export const browseTrainers = asyncHandler(async (_req, res) => ok(res, await trainersWithAvailability()));

export const availableSlots = asyncHandler(async (req, res) => {
  const { trainer, from, to } = req.query;
  if (trainer && !/^[a-f\d]{24}$/i.test(trainer)) throw ApiError.badRequest('Invalid trainer');
  const slots = await browseSlots({
    trainerId: trainer,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });
  ok(res, slots);
});

export const mySlots = asyncHandler(async (req, res) => {
  const filter = { trainer: req.user._id, active: true };
  filter.end = { $gte: req.query.past === 'true' ? new Date(0) : new Date() };
  const slots = await Slot.find(filter).sort({ start: 1 }).limit(500).populate({ path: 'booking', select: 'status learner', populate: { path: 'learner', select: 'name' } });
  ok(res, slots);
});

export const createSlots = asyncHandler(async (req, res) => {
  const slots = await publishSlots(req.user._id, req.body);
  created(res, { count: slots.length, slots });
});

export const removeSlot = asyncHandler(async (req, res) => {
  await deleteSlot(req.user._id, req.params.id);
  ok(res, { deleted: true });
});

// ─── Bookings ─────────────────────────────────────────────
const bookingPopulate = [
  { path: 'learner', select: 'name email phone' },
  { path: 'trainer', select: 'name' },
  { path: 'subscription', select: 'packageName startsAt expiresAt trainingDays daysUsed status' },
];

/** Strips what the viewer is not entitled to (host link is trainer-only; learner contact only to the trainer). */
export function presentBooking(booking, viewer) {
  const o = booking.toObject ? booking.toObject() : { ...booking };
  const idOf = (v) => String(v?._id || v);
  const role = viewer.role === 'admin' ? 'admin' : roleInBooking({ learner: idOf(o.learner), trainer: idOf(o.trainer) }, viewer._id);
  if (!role) return null;
  if (o.meeting) {
    if (role === 'learner') delete o.meeting.hostUrl;
    if (o.status !== 'confirmed') o.meeting = { provider: o.meeting.provider, isDemo: o.meeting.isDemo };
  }
  if (role === 'learner' && o.learner && typeof o.learner === 'object') {
    o.learner = { _id: o.learner._id, name: o.learner.name };
  }
  o.viewerRole = role;
  return o;
}

export const myBookings = asyncHandler(async (req, res) => {
  const mine = req.user.role === 'trainer' ? { trainer: req.user._id } : { learner: req.user._id };
  const pg = getPagination(req.query, { defaultLimit: 50 });
  const filter = { ...mine };
  const now = new Date();
  if (req.query.when === 'upcoming') Object.assign(filter, { status: { $in: ['confirmed', 'needs_review'] }, endAt: { $gte: now } });
  else if (req.query.when === 'past') filter.$or = [{ endAt: { $lt: now } }, { status: { $nin: ['confirmed'] } }];
  if (req.query.status) filter.status = String(req.query.status);
  const [items, total] = await Promise.all([
    Booking.find(filter)
      .sort(req.query.when === 'upcoming' ? { startAt: 1 } : { startAt: -1 })
      .skip(pg.skip).limit(pg.limit)
      .populate(bookingPopulate),
    Booking.countDocuments(filter),
  ]);
  const fb = await Feedback.find({ booking: { $in: items.map((b) => b._id) } }).select('booking rating comment');
  const fbBy = new Map(fb.map((f) => [String(f.booking), { rating: f.rating, comment: f.comment }]));
  ok(res, items.map((b) => { const p = presentBooking(b, req.user); if (p) p.feedback = fbBy.get(String(b._id)) || null; return p; }).filter(Boolean), 200, pageMeta(total, pg));
});

async function loadOwnBooking(req) {
  const booking = await Booking.findById(req.params.id).populate(bookingPopulate);
  if (!booking) throw ApiError.notFound('Booking not found');
  const plain = booking.toObject();
  const learnerId = plain.learner._id;
  const trainerId = plain.trainer._id;
  const uid = String(req.user._id);
  if (req.user.role !== 'admin' && uid !== String(learnerId) && uid !== String(trainerId)) throw ApiError.notFound('Booking not found');
  return booking;
}

export const getBooking = asyncHandler(async (req, res) => {
  const booking = await loadOwnBooking(req);
  const events = await AttendanceEvent.find({ booking: booking._id }).sort({ at: 1 }).select('role type at source');
  const data = presentBooking(booking, req.user);
  ok(res, { ...data, events });
});

export const createBooking = asyncHandler(async (req, res) => {
  if (req.user.role !== 'learner') throw ApiError.forbidden('Only learners can book sessions');
  const booking = await bookSlot({ learner: req.user, slotId: req.body.slotId, notes: req.body.notes });
  created(res, presentBooking(await Booking.findById(booking._id).populate(bookingPopulate), req.user));
});

export const cancelMyBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw ApiError.notFound('Booking not found');
  const uid = String(req.user._id);
  if (req.user.role !== 'admin' && uid !== String(booking.learner) && uid !== String(booking.trainer)) throw ApiError.notFound('Booking not found');
  const updated = await cancelBooking({ booking, actor: req.user, reason: req.body.reason || '' });
  ok(res, { status: updated.status });
});

export const rescheduleMyBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking || (req.user.role !== 'admin' && String(booking.learner) !== String(req.user._id))) throw ApiError.notFound('Booking not found');
  const updated = await rescheduleBooking({ booking, actor: req.user, newSlotId: req.body.slotId });
  ok(res, presentBooking(await Booking.findById(updated._id).populate(bookingPopulate), req.user));
});

/** Demo-room join/leave. Real providers report attendance via webhooks instead. */
export const demoAttendance = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw ApiError.notFound('Booking not found');
  const ev = await recordDemoAttendance({ booking, user: req.user, type: req.body.type });
  ok(res, { type: ev.type, at: ev.at, source: ev.source });
});

// ─── Trainer: own profile & earnings ──────────────────────
export const myTrainerProfile = asyncHandler(async (req, res) => {
  const profile = await Trainer.findOne({ user: req.user._id });
  if (!profile) throw ApiError.notFound('Trainer profile not found');
  const cfg = await getConfig();
  ok(res, { profile, user: { name: req.user.name, email: req.user.email, phone: req.user.phone }, payoutPerSession: profile.payoutPerSession ?? cfg.trainerPayoutPerSession, currency: cfg.currency });
});

export const updateMyTrainerProfile = asyncHandler(async (req, res) => {
  const { phone, ...fields } = req.body;
  const profile = await Trainer.findOne({ user: req.user._id });
  if (!profile) throw ApiError.notFound('Trainer profile not found');
  Object.assign(profile, fields);
  await profile.save();
  if (phone !== undefined) {
    try {
      await User.updateOne({ _id: req.user._id }, { phone });
    } catch (err) {
      if (err.code === 11000) throw ApiError.conflict('That mobile number is already in use');
      throw err;
    }
  }
  if (fields.displayName) await User.updateOne({ _id: req.user._id }, { name: fields.displayName });
  ok(res, profile);
});

export const myEarnings = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 30 });
  const filter = { trainer: req.user._id };
  if (req.query.status) filter.status = String(req.query.status);
  const [items, total, totals] = await Promise.all([
    Earning.find(filter).sort({ sessionAt: -1 }).skip(pg.skip).limit(pg.limit).populate('learner', 'name').select('-approvedBy -paidBy'),
    Earning.countDocuments(filter),
    Earning.aggregate([{ $match: { trainer: req.user._id } }, { $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
  ]);
  const by = Object.fromEntries(totals.map((t) => [t._id, { amount: t.amount, count: t.count }]));
  const cfg = await getConfig();
  ok(res, items, 200, { ...pageMeta(total, pg), totals: by, currency: cfg.currency });
});

// ─── Meeting provider webhook (Zoom) ──────────────────────
export const zoomWebhook = asyncHandler(async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw ApiError.badRequest('Invalid payload');
  }
  // Zoom's one-time endpoint validation is signed with the same secret.
  if (body.event === 'endpoint.url_validation') {
    return res.json(zoomProvider.urlValidation(body.payload?.plainToken || ''));
  }
  if (!zoomProvider.verifyWebhook(raw, req.headers)) throw ApiError.unauthorized('Invalid signature');

  const evt = body.event;
  if (!['meeting.participant_joined', 'meeting.participant_left'].includes(evt)) return ok(res, { ignored: true });
  const obj = body.payload?.object;
  const participant = obj?.participant;
  const booking = await Booking.findOne({ 'meeting.meetingId': String(obj?.id), 'meeting.provider': 'zoom' }).populate('learner trainer', 'email');
  if (!booking || !participant) return ok(res, { ignored: true });

  const email = String(participant.email || '').toLowerCase();
  let role = null;
  if (email && email === String(booking.trainer.email).toLowerCase()) role = 'trainer';
  else if (email && email === String(booking.learner.email).toLowerCase()) role = 'learner';
  // The trainer opens the meeting with the host link, which Zoom reports with the host's account email.
  if (!role) return ok(res, { ignored: true, reason: 'participant email does not match this booking' });

  const joined = evt === 'meeting.participant_joined';
  const at = new Date(joined ? participant.join_time : participant.leave_time);
  await recordProviderEvent({
    booking: { _id: booking._id, trainer: booking.trainer._id, learner: booking.learner._id },
    role,
    type: joined ? 'join' : 'leave',
    at: Number.isNaN(at.getTime()) ? new Date() : at,
    externalId: `zoom:${participant.participant_uuid || participant.user_id || email}:${evt}:${joined ? participant.join_time : participant.leave_time}`,
  });
  return ok(res, { recorded: true });
});

