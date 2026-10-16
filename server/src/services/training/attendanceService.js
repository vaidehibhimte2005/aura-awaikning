import { AttendanceEvent, Booking, Earning, UsageRecord, User } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { addMinutes } from '../../utils/time.js';
import { notify, staffIds } from '../notificationService.js';
import { releaseReservation } from './bookingService.js';
import { decideOutcome, overlapMinutes, presenceIntervals, totalMinutes } from './attendanceMath.js';
import { getConfig, payoutFor } from './configService.js';
import { recomputeCounters } from './subscriptionService.js';

const fmt = (d, tz) => new Intl.DateTimeFormat('en-IN', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));

/** Which side of the booking is this user? (null → not a participant) */
export const roleInBooking = (booking, userId) =>
  String(booking.learner) === String(userId) ? 'learner' : String(booking.trainer) === String(userId) ? 'trainer' : null;

/**
 * Demo-room attendance. Only possible when the booking's meeting is a demo meeting, only by
 * the two participants, and only inside the join window. Stored with source "demo".
 */
export async function recordDemoAttendance({ booking, user, type }) {
  const cfg = await getConfig();
  const role = roleInBooking(booking, user._id);
  if (!role) throw ApiError.forbidden();
  if (!booking.meeting?.isDemo) throw ApiError.badRequest('This session uses a real meeting provider; attendance is recorded automatically.');
  if (booking.status !== 'confirmed') throw ApiError.conflict('This session is no longer open.');
  const now = new Date();
  const opens = addMinutes(booking.startAt, -cfg.policy.joinWindowMinutes);
  const closes = addMinutes(booking.endAt, cfg.policy.finalizeGraceMinutes);
  if (now < opens) throw ApiError.badRequest(`The room opens ${cfg.policy.joinWindowMinutes} minutes before the start time.`);
  if (now > closes) throw ApiError.badRequest('This session has ended.');

  const last = await AttendanceEvent.findOne({ booking: booking._id, user: user._id }).sort({ at: -1 });
  if (last && last.type === type) return last; // duplicate click → no duplicate event
  if (!last && type === 'leave') throw ApiError.badRequest('Join the room first.');
  return AttendanceEvent.create({ booking: booking._id, user: user._id, role, type, at: now, source: 'demo' });
}

/** Provider-verified attendance (webhook). `externalId` makes redelivered webhooks harmless. */
export async function recordProviderEvent({ booking, role, type, at, externalId }) {
  const userId = role === 'trainer' ? booking.trainer : booking.learner;
  try {
    return await AttendanceEvent.create({ booking: booking._id, user: userId, role, type, at, source: 'provider', externalId });
  } catch (err) {
    if (err.code === 11000) return null;
    throw err;
  }
}

export async function computeAttendance(booking, cfg) {
  const events = await AttendanceEvent.find({ booking: booking._id }).sort({ at: 1 });
  const usable = events.filter((e) => e.source === 'provider' || cfg.policy.acceptDemoAttendance);
  const interval = (role) => presenceIntervals(usable.filter((e) => e.role === role), booking.startAt, booking.endAt);
  const t = interval('trainer');
  const l = interval('learner');
  return {
    trainerMinutes: Math.round(totalMinutes(t)),
    learnerMinutes: Math.round(totalMinutes(l)),
    overlapMinutes: Math.round(overlapMinutes(t, l)),
    usedDemoEvents: usable.some((e) => e.source === 'demo'),
    ignoredDemoEvents: events.length - usable.length,
  };
}

/**
 * Evaluates one finished session against the completion policy and settles it.
 * Safe to call repeatedly / concurrently: the status transition is an atomic claim
 * from "confirmed", so only one caller ever applies the effects.
 */
export async function finalizeBooking(bookingId, { force = false } = {}) {
  const cfg = await getConfig();
  const booking = await Booking.findById(bookingId);
  if (!booking || booking.status !== 'confirmed') return booking;
  if (!force && Date.now() < addMinutes(booking.endAt, cfg.policy.finalizeGraceMinutes).getTime()) return booking;

  const att = await computeAttendance(booking, cfg);
  const decision = decideOutcome({
    trainerMin: att.trainerMinutes,
    learnerMin: att.learnerMinutes,
    overlapMin: att.overlapMinutes,
    durationMin: booking.durationMin,
    policy: cfg.policy,
  });
  const claimed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'confirmed' },
    {
      status: decision.status,
      attendance: att,
      'outcome.reason': decision.reason,
      'outcome.evaluatedAt': new Date(),
    },
    { new: true },
  );
  if (!claimed) return Booking.findById(bookingId);
  await settleBooking(claimed, cfg);
  return claimed;
}

/**
 * Applies everything that follows from a booking's final status. Every step is
 * idempotent (flags / unique indexes), so re-running it after a crash is safe.
 */
export async function settleBooking(booking, cfgIn) {
  const cfg = cfgIn || (await getConfig());
  const { status } = booking;
  const when = fmt(booking.startAt, cfg.timezone);
  const learner = await User.findById(booking.learner).select('name');
  const trainer = await User.findById(booking.trainer).select('name');
  const base = { related: { type: 'booking', id: booking._id } };
  const admins = () => staffIds(['admin']);

  if (status !== 'needs_review') await releaseReservation(booking);

  if (status === 'completed') {
    let counted = false;
    try {
      await UsageRecord.create({ subscription: booking.subscription, user: booking.learner, booking: booking._id, dayKey: booking.dayKey });
      counted = true;
    } catch (err) {
      if (err.code !== 11000) throw err;
      // Either this booking was already recorded (retry) or another session the same day already used the day.
      counted = !!(await UsageRecord.exists({ booking: booking._id }));
    }
    await recomputeCounters(booking.subscription);
    await Booking.updateOne({ _id: booking._id }, { 'outcome.countedAsTrainingDay': counted, 'outcome.sameDayAsPrevious': !counted });
    const amount = await payoutFor(booking.trainer, cfg);
    await createEarning(booking, amount, cfg, booking.outcome?.resolvedBy ? 'admin_resolved' : 'completed');
    await notify(booking.learner, {
      ...base,
      type: 'session',
      title: 'Session completed',
      message: `${when} with ${trainer?.name}: completed. ${counted ? 'One training day was used.' : 'No extra training day was used (you already trained that day).'}`,
      link: '/dashboard/history',
      idempotencyKey: `session_completed:${booking._id}:learner`,
    });
    await notify(booking.trainer, {
      ...base,
      type: 'session',
      title: 'Session completed',
      message: `${when} with ${learner?.name} is complete. Your earning of ₹${amount} is pending admin approval.`,
      link: '/trainer/earnings',
      idempotencyKey: `session_completed:${booking._id}:trainer`,
    });
  } else if (status === 'trainer_no_show') {
    await notify(booking.learner, {
      ...base, type: 'attendance', title: 'Trainer did not join',
      message: `Your ${when} session did not take place because the trainer did not join. No training day was used — please rebook.`,
      link: '/dashboard/book', idempotencyKey: `session_trainer_noshow:${booking._id}:learner`,
    });
    await notify(booking.trainer, {
      ...base, type: 'attendance', title: 'Missed session',
      message: `You did not join the ${when} session with ${learner?.name}. It is not counted and no earning is created.`,
      link: '/trainer/bookings', idempotencyKey: `session_trainer_noshow:${booking._id}:trainer`,
    });
    await notify(await admins(), {
      ...base, type: 'attendance', title: 'Trainer no-show',
      message: `${trainer?.name} did not join the ${when} session with ${learner?.name}.`,
      link: '/admin/bookings', idempotencyKey: `session_trainer_noshow:${booking._id}:admin`,
    });
  } else if (status === 'learner_no_show') {
    if (cfg.policy.payTrainerOnLearnerNoShow) await createEarning(booking, await payoutFor(booking.trainer, cfg), cfg, 'learner_no_show');
    await notify(booking.learner, {
      ...base, type: 'attendance', title: 'Missed session',
      message: `You did not join your ${when} session. No training day was used, but the slot is gone — book another time.`,
      link: '/dashboard/book', idempotencyKey: `session_learner_noshow:${booking._id}:learner`,
    });
    await notify(booking.trainer, {
      ...base, type: 'attendance', title: 'Learner did not join',
      message: `${learner?.name} did not join the ${when} session.${cfg.policy.payTrainerOnLearnerNoShow ? ' An earning was created per policy.' : ' No earning is created for this session.'}`,
      link: '/trainer/bookings', idempotencyKey: `session_learner_noshow:${booking._id}:trainer`,
    });
  } else if (status === 'needs_review') {
    await notify(await admins(), {
      ...base, type: 'attendance', title: 'Attendance needs review',
      message: `${trainer?.name} / ${learner?.name} (${when}): ${booking.outcome?.reason || 'attendance below policy'}`,
      link: '/admin/bookings?status=needs_review', idempotencyKey: `session_review:${booking._id}:admin`,
    });
    await notify([booking.learner, booking.trainer], {
      ...base, type: 'attendance', title: 'Session under review',
      message: `Your ${when} session is being reviewed by an administrator because attendance did not meet the completion policy.`,
      link: '/dashboard/bookings', idempotencyKey: `session_review:${booking._id}:parties`,
    });
  } else if (status === 'technical_failure') {
    await notify([booking.learner, booking.trainer], {
      ...base, type: 'attendance', title: 'Session not counted',
      message: `The ${when} session was marked as a technical failure. No training day was used and no earning was created.`,
      link: '/dashboard/bookings', idempotencyKey: `session_techfail:${booking._id}:parties`,
    });
  }
  await Booking.updateOne({ _id: booking._id }, { effectsApplied: true });
}

async function createEarning(booking, amount, cfg, reason) {
  try {
    const res = await Earning.updateOne(
      { booking: booking._id },
      {
        $setOnInsert: {
          trainer: booking.trainer,
          learner: booking.learner,
          amount,
          currency: cfg.currency,
          reason,
          status: 'pending',
          sessionAt: booking.startAt,
        },
      },
      { upsert: true },
    );
    return res.upsertedCount > 0;
  } catch (err) {
    if (err.code === 11000) return false; // concurrent settle already created it
    throw err;
  }
}

/**
 * Admin resolution of a session that needs review (or a disputed no-show).
 *  complete → counts as a completed session (day used + earning)
 *  technical_failure → not counted, not paid
 *  trainer_no_show / learner_no_show → recorded accordingly
 */
export async function resolveBooking({ bookingId, admin, action, note = '' }) {
  const map = { complete: 'completed', technical_failure: 'technical_failure', trainer_no_show: 'trainer_no_show', learner_no_show: 'learner_no_show' };
  const status = map[action];
  if (!status) throw ApiError.badRequest('Unknown resolution');
  const booking = await Booking.findById(bookingId);
  if (!booking) throw ApiError.notFound('Booking not found');
  if (!['needs_review', 'trainer_no_show', 'learner_no_show'].includes(booking.status)) {
    throw ApiError.conflict('Only sessions under review or marked as no-shows can be resolved.');
  }
  if (booking.status === status) throw ApiError.conflict('The booking already has that status.');
  if (booking.status === 'completed') throw ApiError.conflict('Completed sessions cannot be changed.');
  const claimed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: booking.status },
    { status, 'outcome.reason': `Resolved by administrator: ${note || action}`, 'outcome.resolvedBy': admin._id, 'outcome.resolutionNote': note, 'outcome.evaluatedAt': new Date() },
    { new: true },
  );
  if (!claimed) throw ApiError.conflict('This booking was already changed.');
  await settleBooking(claimed);
  return claimed;
}
