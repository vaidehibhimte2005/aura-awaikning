import { Booking, Earning, Subscription } from '../../models/index.js';
import { addMinutes } from '../../utils/time.js';
import { notify, staffIds } from '../notificationService.js';
import { finalizeBooking, settleBooking } from './attendanceService.js';
import { getConfig } from './configService.js';

const fmt = (d, tz) => new Intl.DateTimeFormat('en-IN', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
const DAY = 86400000;

/**
 * One scheduler tick. Every step is idempotent (atomic status claims and notification
 * idempotency keys), so overlapping ticks or multiple server instances cannot double-apply anything.
 */
export async function runTrainingJobs() {
  const cfg = await getConfig();
  const now = new Date();
  const summary = { finalized: 0, repaired: 0, reminders: 0, expired: 0 };

  // 1. Evaluate sessions whose end + grace has passed.
  const due = await Booking.find({ status: 'confirmed', endAt: { $lte: addMinutes(now, -cfg.policy.finalizeGraceMinutes) } }).select('_id').limit(200);
  for (const b of due) {
    // eslint-disable-next-line no-await-in-loop
    await finalizeBooking(b._id).catch((e) => console.error('finalize', e.message));
    summary.finalized += 1;
  }

  // 2. Repair: a crash between the status change and the follow-up effects leaves effectsApplied=false.
  const stuck = await Booking.find({
    effectsApplied: false,
    status: { $in: ['completed', 'learner_no_show', 'trainer_no_show', 'technical_failure'] },
    updatedAt: { $lte: addMinutes(now, -2) },
  }).limit(100);
  for (const b of stuck) {
    // eslint-disable-next-line no-await-in-loop
    await settleBooking(b, cfg).catch((e) => console.error('settle', e.message));
    summary.repaired += 1;
  }

  // 3. Upcoming-session reminders.
  const soon = await Booking.find({ status: 'confirmed', startAt: { $gt: now, $lte: addMinutes(now, cfg.reminders.sessionMinutes) } })
    .populate('learner', 'name')
    .populate('trainer', 'name');
  for (const b of soon) {
    const when = fmt(b.startAt, cfg.timezone);
    const base = { type: 'session', related: { type: 'booking', id: b._id } };
    // eslint-disable-next-line no-await-in-loop
    await notify(b.learner._id, { ...base, title: 'Session starting soon', message: `Your session with ${b.trainer.name} starts at ${when}.`, link: '/dashboard/bookings', idempotencyKey: `session_reminder:${b._id}:learner` }, { channels: ['email'] });
    // eslint-disable-next-line no-await-in-loop
    await notify(b.trainer._id, { ...base, title: 'Session starting soon', message: `${b.learner.name} — ${when}.`, link: '/trainer/bookings', idempotencyKey: `session_reminder:${b._id}:trainer` });
    summary.reminders += 1;
  }

  // 4. Package expiry / renewal reminders.
  const live = await Subscription.find({ status: 'active', expiresAt: { $gt: now }, startsAt: { $lte: now } });
  for (const s of live) {
    const daysLeft = (s.expiresAt - now) / DAY;
    const link = '/dashboard/plans';
    for (const d of cfg.reminders.expiryDays) {
      if (daysLeft <= d && daysLeft > 0) {
        // Only the tightest threshold that applies is sent for a given tick; keys stop repeats.
        const tightest = Math.min(...cfg.reminders.expiryDays.filter((x) => daysLeft <= x));
        if (d !== tightest) continue;
        // eslint-disable-next-line no-await-in-loop
        await notify(s.user, {
          type: 'package', title: `Your package expires in ${Math.ceil(daysLeft)} day${Math.ceil(daysLeft) === 1 ? '' : 's'}`,
          message: `${s.packageName} ends ${s.expiresAt.toDateString()} with ${s.remainingDays} training day${s.remainingDays === 1 ? '' : 's'} left. Renew to keep training.`,
          link, related: { type: 'subscription', id: s._id }, idempotencyKey: `pkg_expiring:${s._id}:${d}`,
        }, { channels: ['email'] });
        summary.reminders += 1;
      }
    }
    if (s.remainingDays === 0) {
      // eslint-disable-next-line no-await-in-loop
      await notify(s.user, {
        type: 'package', title: 'All training days used',
        message: `You have used every training day in ${s.packageName}. Renew or upgrade to keep training.`,
        link, related: { type: 'subscription', id: s._id }, idempotencyKey: `pkg_exhausted:${s._id}`,
      });
    }
  }
  const expired = await Subscription.find({ status: 'active', expiresAt: { $lte: now } }).limit(200);
  for (const s of expired) {
    // eslint-disable-next-line no-await-in-loop
    await notify(s.user, {
      type: 'package', title: 'Your package has expired',
      message: `${s.packageName} expired on ${s.expiresAt.toDateString()}${s.remainingDays ? ` with ${s.remainingDays} unused training day${s.remainingDays === 1 ? '' : 's'}` : ''}. Choose a new plan to continue.`,
      link: '/dashboard/plans', related: { type: 'subscription', id: s._id }, idempotencyKey: `pkg_expired:${s._id}`,
    });
    // eslint-disable-next-line no-await-in-loop
    await Subscription.updateOne({ _id: s._id, status: 'active' }, { status: 'expired' });
    summary.expired += 1;
  }

  // 5. Daily nudge to admins when payouts are waiting.
  const pending = await Earning.aggregate([{ $match: { status: 'pending' } }, { $group: { _id: null, n: { $sum: 1 }, total: { $sum: '$amount' } } }]);
  if (pending[0]?.n) {
    const day = now.toISOString().slice(0, 10);
    await notify(await staffIds(['admin']), {
      type: 'payout', title: 'Trainer payouts awaiting approval',
      message: `${pending[0].n} earning${pending[0].n === 1 ? '' : 's'} totalling ₹${pending[0].total} ${pending[0].n === 1 ? 'is' : 'are'} pending.`,
      link: '/admin/payouts', idempotencyKey: `payout_pending:${day}`,
    });
  }
  return summary;
}
