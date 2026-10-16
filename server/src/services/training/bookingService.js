import { Booking, Slot, Subscription, User } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { addDays, addMinutes, dayKeyOf } from '../../utils/time.js';
import { cancelMeetingFor, createMeetingFor } from '../meetings/index.js';
import { notify, staffIds } from '../notificationService.js';
import { getConfig } from './configService.js';

const fmt = (d, tz) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));

const BLOCKING = ['confirmed', 'completed', 'needs_review'];

/** Atomically holds one training day on a package that covers the slot. Never exceeds what's left. */
async function reserveDay(userId, slot) {
  const candidates = await Subscription.find({
    user: userId,
    status: 'active',
    startsAt: { $lte: slot.start },
    expiresAt: { $gte: slot.end },
  }).sort({ expiresAt: 1 });
  for (const c of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const held = await Subscription.findOneAndUpdate(
      { _id: c._id, status: 'active', $expr: { $lt: [{ $add: ['$daysUsed', '$reservedDays'] }, '$trainingDays'] } },
      { $inc: { reservedDays: 1 } },
      { new: true },
    );
    if (held) return held;
  }
  return null;
}

/** Idempotent: the flag on the booking guarantees the hold is released exactly once. */
export async function releaseReservation(booking) {
  const claimed = await Booking.findOneAndUpdate({ _id: booking._id, reservationReleased: false }, { reservationReleased: true });
  if (claimed) await Subscription.updateOne({ _id: booking.subscription, reservedDays: { $gt: 0 } }, { $inc: { reservedDays: -1 } });
}

async function assertSlotBookable(slot, learner, cfg, { ignoreBookingId } = {}) {
  const now = new Date();
  if (!slot || !slot.active || slot.status !== 'available') throw ApiError.conflict('This slot is no longer available. Please pick another.');
  if (slot.start < addMinutes(now, cfg.booking.minLeadMinutes)) {
    throw ApiError.badRequest(`Sessions must be booked at least ${cfg.booking.minLeadMinutes} minutes ahead.`);
  }
  if (slot.start > addDays(now, cfg.booking.maxAdvanceDays)) throw ApiError.badRequest(`You can book up to ${cfg.booking.maxAdvanceDays} days ahead.`);
  if (String(slot.trainer) === String(learner._id)) throw ApiError.forbidden('You cannot book your own slot.');
  const trainer = await User.findById(slot.trainer).select('name email isActive role');
  if (!trainer || !trainer.isActive || trainer.role !== 'trainer') throw ApiError.conflict('This trainer is not currently available.');

  const dayKey = dayKeyOf(slot.start, cfg.timezone);
  const sameDay = await Booking.countDocuments({
    learner: learner._id,
    dayKey,
    status: { $in: BLOCKING },
    ...(ignoreBookingId ? { _id: { $ne: ignoreBookingId } } : {}),
  });
  if (sameDay >= cfg.booking.maxSessionsPerDay) {
    throw ApiError.conflict(`You can book at most ${cfg.booking.maxSessionsPerDay} session${cfg.booking.maxSessionsPerDay === 1 ? '' : 's'} per day.`);
  }
  const clash = await Booking.exists({
    learner: learner._id,
    status: 'confirmed',
    startAt: { $lt: slot.end },
    endAt: { $gt: slot.start },
    ...(ignoreBookingId ? { _id: { $ne: ignoreBookingId } } : {}),
  });
  if (clash) throw ApiError.conflict('You already have a session at that time.');
  return { trainer, dayKey };
}

export async function bookSlot({ learner, slotId, notes = '' }) {
  const cfg = await getConfig();
  const slot = await Slot.findById(slotId);
  const { trainer, dayKey } = await assertSlotBookable(slot, learner, cfg);

  const sub = await reserveDay(learner._id, slot);
  if (!sub) {
    throw new ApiError(402, 'You need an active package with training days remaining that is valid on that date. Choose a plan first.');
  }

  // The atomic claim is what prevents double-booking: only one caller can flip available → booked.
  const claimed = await Slot.findOneAndUpdate({ _id: slot._id, active: true, status: 'available' }, { status: 'booked' }, { new: true });
  if (!claimed) {
    await Subscription.updateOne({ _id: sub._id, reservedDays: { $gt: 0 } }, { $inc: { reservedDays: -1 } });
    throw ApiError.conflict('Someone just booked that slot. Please pick another.');
  }

  const booking = new Booking({
    learner: learner._id,
    trainer: slot.trainer,
    slot: slot._id,
    subscription: sub._id,
    startAt: slot.start,
    endAt: slot.end,
    durationMin: slot.durationMin,
    dayKey,
    notes,
  });
  try {
    booking.meeting = await createMeetingFor(booking, trainer);
    await booking.save();
    await Slot.updateOne({ _id: slot._id }, { booking: booking._id });
  } catch (err) {
    await Slot.updateOne({ _id: slot._id }, { status: 'available', $unset: { booking: 1 } });
    await Subscription.updateOne({ _id: sub._id, reservedDays: { $gt: 0 } }, { $inc: { reservedDays: -1 } });
    if (err.code === 11000) throw ApiError.conflict('Someone just booked that slot. Please pick another.');
    throw err;
  }

  const when = fmt(booking.startAt, cfg.timezone);
  const demoNote = booking.meeting.isDemo ? ' (demo meeting room)' : '';
  await notify(learner._id, {
    type: 'booking',
    title: 'Session confirmed',
    message: `${when} with ${trainer.name}${demoNote}.`,
    link: `/dashboard/bookings`,
    related: { type: 'booking', id: booking._id },
    idempotencyKey: `booking_confirmed:${booking._id}:learner`,
  }, { channels: ['email'] });
  await notify(trainer._id, {
    type: 'booking',
    title: 'New booking',
    message: `${learner.name} booked ${when}. No action needed — it is confirmed automatically.`,
    link: `/trainer/bookings`,
    related: { type: 'booking', id: booking._id },
    idempotencyKey: `booking_confirmed:${booking._id}:trainer`,
  }, { channels: ['email'] });
  return booking;
}

const CUTOFF_MSG = (h) => `Sessions can only be cancelled or changed at least ${h} hour${h === 1 ? '' : 's'} before they start. Please contact support.`;

/** Cancel by the learner (before the cutoff), the trainer (reason required) or an admin. */
export async function cancelBooking({ booking, actor, reason = '' }) {
  const cfg = await getConfig();
  const isAdmin = actor.role === 'admin';
  const isTrainer = String(booking.trainer) === String(actor._id);
  const isLearner = String(booking.learner) === String(actor._id);
  if (!isAdmin && !isTrainer && !isLearner) throw ApiError.forbidden();
  if (booking.status !== 'confirmed') throw ApiError.conflict('This booking can no longer be cancelled.');
  if (booking.startAt <= new Date()) throw ApiError.conflict('This session has already started.');
  if (isLearner && !isAdmin && booking.startAt - Date.now() < cfg.booking.cancelCutoffHours * 3600000) {
    throw ApiError.forbidden(CUTOFF_MSG(cfg.booking.cancelCutoffHours));
  }
  if (isTrainer && !isAdmin && !reason.trim()) throw ApiError.badRequest('Please give the learner a reason for cancelling.');

  const status = isAdmin ? 'cancelled_by_admin' : isTrainer ? 'cancelled_by_trainer' : 'cancelled_by_learner';
  const claimed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'confirmed' },
    { status, cancelledAt: new Date(), cancelReason: reason.slice(0, 300), effectsApplied: true },
    { new: true },
  );
  if (!claimed) throw ApiError.conflict('This booking was already changed.');
  await releaseReservation(claimed);
  // Learner/admin cancellation reopens the slot; a trainer cancelling withdraws it entirely.
  if (status === 'cancelled_by_trainer') {
    await Slot.updateOne({ _id: claimed.slot }, { status: 'cancelled', active: false });
  } else {
    await Slot.updateOne({ _id: claimed.slot }, { status: 'available', $unset: { booking: 1 } });
  }
  await cancelMeetingFor(claimed);

  const when = fmt(claimed.startAt, cfg.timezone);
  const who = isAdmin ? 'an administrator' : isTrainer ? 'your trainer' : 'the learner';
  const base = { type: 'booking', related: { type: 'booking', id: claimed._id } };
  if (!isLearner || isAdmin) {
    await notify(claimed.learner, {
      ...base,
      title: 'Session cancelled',
      message: `Your session on ${when} was cancelled by ${who}${reason ? `: ${reason}` : ''}. No training day was used — book another time.`,
      link: '/dashboard/book',
      idempotencyKey: `booking_cancelled:${claimed._id}:learner`,
    }, { channels: ['email'] });
  } else {
    await notify(claimed.learner, { ...base, title: 'Booking cancelled', message: `Your session on ${when} was cancelled. No training day was used.`, link: '/dashboard/bookings', idempotencyKey: `booking_cancelled:${claimed._id}:learner` });
  }
  if (!isTrainer || isAdmin) {
    await notify(claimed.trainer, { ...base, title: 'Booking cancelled', message: `The ${when} session was cancelled by ${isAdmin ? 'an administrator' : 'the learner'}. The slot is ${isAdmin ? 'open again' : 'open again'}.`, link: '/trainer/bookings', idempotencyKey: `booking_cancelled:${claimed._id}:trainer` });
  }
  if (isTrainer && !isAdmin) {
    await notify(await staffIds(['admin']), { ...base, type: 'attendance', title: 'Trainer cancelled a booking', message: `A trainer cancelled the ${when} session${reason ? `: ${reason}` : ''}.`, link: '/admin/bookings', idempotencyKey: `booking_cancelled:${claimed._id}:admin` });
  }
  return claimed;
}

/** Moves a confirmed booking to another published slot (learner before the cutoff, or admin). */
export async function rescheduleBooking({ booking, actor, newSlotId }) {
  const cfg = await getConfig();
  const isAdmin = actor.role === 'admin';
  if (!isAdmin && String(booking.learner) !== String(actor._id)) throw ApiError.forbidden();
  if (booking.status !== 'confirmed') throw ApiError.conflict('Only confirmed bookings can be rescheduled.');
  if (!isAdmin && booking.startAt - Date.now() < cfg.booking.cancelCutoffHours * 3600000) throw ApiError.forbidden(CUTOFF_MSG(cfg.booking.cancelCutoffHours));
  if (String(newSlotId) === String(booking.slot)) throw ApiError.badRequest('Choose a different slot.');

  const learner = await User.findById(booking.learner);
  const slot = await Slot.findById(newSlotId);
  const { trainer, dayKey } = await assertSlotBookable(slot, learner, cfg, { ignoreBookingId: booking._id });
  const sub = await Subscription.findById(booking.subscription);
  if (!sub || sub.status !== 'active' || sub.startsAt > slot.start || sub.expiresAt < slot.end) {
    throw ApiError.badRequest('That time is outside your package validity. Pick a date within your package period.');
  }

  const claimed = await Slot.findOneAndUpdate({ _id: slot._id, active: true, status: 'available' }, { status: 'booked', booking: booking._id }, { new: true });
  if (!claimed) throw ApiError.conflict('Someone just booked that slot. Please pick another.');

  const oldSlot = booking.slot;
  const oldStart = booking.startAt;
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'confirmed', slot: oldSlot },
    {
      slot: slot._id,
      trainer: slot.trainer,
      startAt: slot.start,
      endAt: slot.end,
      durationMin: slot.durationMin,
      dayKey,
      $push: { rescheduledFrom: { slot: oldSlot, startAt: oldStart, at: new Date() } },
    },
    { new: true },
  );
  if (!updated) {
    await Slot.updateOne({ _id: slot._id }, { status: 'available', $unset: { booking: 1 } });
    throw ApiError.conflict('This booking was already changed.');
  }
  await Slot.updateOne({ _id: oldSlot }, { status: 'available', $unset: { booking: 1 } });
  if (!updated.meeting?.isDemo) {
    await cancelMeetingFor(booking);
    updated.meeting = await createMeetingFor(updated, trainer);
    await updated.save();
  }

  const when = fmt(updated.startAt, cfg.timezone);
  const base = { type: 'booking', related: { type: 'booking', id: updated._id } };
  const key = `booking_rescheduled:${updated._id}:${updated.startAt.getTime()}`;
  await notify(updated.learner, { ...base, title: 'Session rescheduled', message: `Your session is now ${when} with ${trainer.name}.`, link: '/dashboard/bookings', idempotencyKey: `${key}:learner` });
  await notify(updated.trainer, { ...base, title: 'Booking rescheduled in', message: `${learner.name} is booked for ${when}.`, link: '/trainer/bookings', idempotencyKey: `${key}:trainer` });
  if (String(oldSlot) && String(booking.trainer) !== String(updated.trainer)) {
    await notify(booking.trainer, { ...base, title: 'Booking moved away', message: `${learner.name} moved their ${fmt(oldStart, cfg.timezone)} session to another trainer. The slot is open again.`, link: '/trainer/bookings', idempotencyKey: `${key}:oldtrainer` });
  }
  return updated;
}
