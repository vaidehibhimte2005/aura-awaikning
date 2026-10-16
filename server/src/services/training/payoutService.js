import { Earning } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { logActivity } from '../activityService.js';
import { notify } from '../notificationService.js';

const ids = (list) => [...new Set((list || []).map(String))];

/**
 * Payout workflow: pending → approved → paid (or failed → pending again).
 * Every transition is a guarded atomic update, so double-clicks and parallel admins can't
 * double-approve or double-pay. NOTE: "paid" is the admin's confirmation that they paid the
 * trainer outside this system (bank / UPI). No money is moved by this software.
 */
export async function approve(earningIds, admin) {
  const list = ids(earningIds);
  const targets = await Earning.find({ _id: { $in: list }, status: 'pending' }).select('_id trainer amount');
  if (!targets.length) throw ApiError.conflict('Nothing to approve — only pending earnings can be approved.');
  const res = await Earning.updateMany(
    { _id: { $in: targets.map((t) => t._id) }, status: 'pending' },
    { status: 'approved', approvedAt: new Date(), approvedBy: admin._id, $unset: { failureReason: 1 } },
  );
  await logActivity({ actor: admin, action: 'payout.approved', entityType: 'earning', entityLabel: `${res.modifiedCount} earning(s)`, meta: { ids: targets.map((t) => String(t._id)) } });
  await notifyTrainers(targets, 'approved');
  return { updated: res.modifiedCount };
}

export async function markPaid(earningIds, admin, reference = '') {
  const list = ids(earningIds);
  const targets = await Earning.find({ _id: { $in: list }, status: 'approved' }).select('_id trainer amount');
  if (!targets.length) throw ApiError.conflict('Nothing to mark paid — earnings must be approved first.');
  const res = await Earning.updateMany(
    { _id: { $in: targets.map((t) => t._id) }, status: 'approved' },
    { status: 'paid', paidAt: new Date(), paidBy: admin._id, payoutReference: reference.slice(0, 120) },
  );
  await logActivity({ actor: admin, action: 'payout.paid', entityType: 'earning', entityLabel: `${res.modifiedCount} earning(s)`, meta: { reference, ids: targets.map((t) => String(t._id)) } });
  await notifyTrainers(targets, 'paid');
  return { updated: res.modifiedCount };
}

export async function markFailed(earningIds, admin, reason = '') {
  const list = ids(earningIds);
  const targets = await Earning.find({ _id: { $in: list }, status: { $in: ['pending', 'approved'] } }).select('_id trainer amount');
  if (!targets.length) throw ApiError.conflict('Only pending or approved earnings can be marked failed.');
  const res = await Earning.updateMany(
    { _id: { $in: targets.map((t) => t._id) }, status: { $in: ['pending', 'approved'] } },
    { status: 'failed', failureReason: reason.slice(0, 200) || 'Payout failed' },
  );
  await logActivity({ actor: admin, action: 'payout.failed', entityType: 'earning', entityLabel: `${res.modifiedCount} earning(s)`, reason });
  await notifyTrainers(targets, 'failed', reason);
  return { updated: res.modifiedCount };
}

/** failed → pending so it can be approved again. */
export async function reopen(earningIds, admin) {
  const res = await Earning.updateMany({ _id: { $in: ids(earningIds) }, status: 'failed' }, { status: 'pending', $unset: { failureReason: 1 } });
  if (!res.modifiedCount) throw ApiError.conflict('Only failed earnings can be reopened.');
  await logActivity({ actor: admin, action: 'payout.reopened', entityType: 'earning', entityLabel: `${res.modifiedCount} earning(s)` });
  return { updated: res.modifiedCount };
}

async function notifyTrainers(earnings, outcome, reason) {
  const byTrainer = new Map();
  for (const e of earnings) {
    const cur = byTrainer.get(String(e.trainer)) || { count: 0, total: 0 };
    cur.count += 1;
    cur.total += e.amount;
    byTrainer.set(String(e.trainer), cur);
  }
  const text = { approved: 'approved for payout', paid: 'marked as paid', failed: 'marked as failed' };
  for (const [trainer, { count, total }] of byTrainer) {
    // eslint-disable-next-line no-await-in-loop
    await notify(trainer, {
      type: 'payout',
      title: `Payout ${outcome}`,
      message: `${count} earning${count === 1 ? '' : 's'} (₹${total}) ${text[outcome]}${outcome === 'failed' && reason ? `: ${reason}` : ''}.`,
      link: '/trainer/earnings',
      idempotencyKey: `payout_${outcome}:${trainer}:${earnings.filter((e) => String(e.trainer) === trainer).map((e) => e._id).join('').slice(-24)}`,
    });
  }
}
