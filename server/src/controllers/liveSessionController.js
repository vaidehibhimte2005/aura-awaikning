import { Enrollment, LiveSession, User } from '../models/index.js';
import { ApiError, asyncHandler, created, getPagination, ok, pageMeta } from '../utils/http.js';
import { uniqueSlug } from '../utils/slugify.js';
import { can, PERMISSIONS } from '../config/permissions.js';
import { trainerIdFor } from '../services/accessService.js';
import { notify } from '../services/notificationService.js';

const manageAll = (req) => req.user && can(req.user, PERMISSIONS.LIVE_MANAGE_ALL);

async function assertCanManage(req, session) {
  if (manageAll(req)) return;
  if (can(req.user, PERMISSIONS.LIVE_MANAGE_OWN)) {
    const tid = await trainerIdFor(req);
    if (tid && session.trainer && session.trainer.toString() === tid.toString()) return;
  }
  throw ApiError.forbidden('You can only manage your own sessions');
}

/** Strips stream links the viewer is not allowed to see. */
async function shape(req, s, { includeRegistered = true } = {}) {
  const o = s.toObject({ virtuals: true });
  const registered = !!req.user && (s.registrations || []).some((u) => u.toString() === req.user.id);
  delete o.registrations;
  o.isRegistered = includeRegistered ? registered : undefined;
  const staff = !!req.user && (manageAll(req) || can(req.user, PERMISSIONS.LIVE_MANAGE_OWN));
  let allowed;
  if (staff) allowed = true;
  else if (o.accessLevel === 'enrolled') {
    allowed = !!req.user && !!o.course
      && !!(await Enrollment.exists({ user: req.user._id, course: o.course._id || o.course, status: { $ne: 'revoked' } }));
  } else if (o.accessLevel === 'registered') {
    allowed = !!req.user && (registered || !o.requiresRegistration);
  } else {
    allowed = !o.requiresRegistration || registered;
  }
  o.locked = !allowed;
  if (!allowed) {
    o.youtubeId = '';
    o.youtubeUrl = '';
    o.recordingId = '';
    o.recordingUrl = '';
  }
  return o;
}

/**
 * GET /api/live-sessions?kind=session|event&state=upcoming|live|completed
 * `?scope=manage` lists what the caller manages (including unpublished).
 */
export const listSessions = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 12 });
  const filter = {};
  if (req.query.kind) filter.kind = String(req.query.kind);
  if (req.query.scope === 'manage' && req.user) {
    if (!manageAll(req)) {
      if (!can(req.user, PERMISSIONS.LIVE_MANAGE_OWN)) throw ApiError.forbidden();
      const tid = await trainerIdFor(req);
      if (!tid) return ok(res, [], 200, pageMeta(0, pg));
      filter.trainer = tid;
    }
    if (['pending', 'approved', 'rejected'].includes(req.query.approvalStatus)) {
      filter.approvalStatus = req.query.approvalStatus;
    }
  } else {
    filter.isPublished = true;
  }
  if (req.query.trainer && !filter.trainer) filter.trainer = String(req.query.trainer);

  const now = new Date();
  let sort = { startAt: 1 };
  if (req.query.state === 'upcoming') {
    filter.startAt = { $gt: now };
    filter.liveStatus = { $ne: 'ended' };
  } else if (req.query.state === 'live') {
    filter.$or = [{ liveStatus: 'live' }, { liveStatus: 'auto', startAt: { $lte: now }, endAt: { $gte: now } }];
  } else if (req.query.state === 'current') {
    // upcoming + live, soonest first
    filter.$or = [{ liveStatus: 'live' }, { liveStatus: 'auto', endAt: { $gte: now } }];
  } else if (req.query.state === 'completed') {
    filter.$or = [{ liveStatus: 'ended' }, { liveStatus: 'auto', endAt: { $lt: now } }];
    sort = { startAt: -1 };
  } else if (req.query.scope === 'manage') {
    sort = { startAt: -1 };
  }

  const [items, total] = await Promise.all([
    LiveSession.find(filter)
      .sort(sort)
      .skip(pg.skip)
      .limit(pg.limit)
      .populate('trainer', 'displayName slug photo title')
      .populate('course', 'title slug'),
    LiveSession.countDocuments(filter),
  ]);
  const data = await Promise.all(items.map((s) => shape(req, s)));
  ok(res, data, 200, pageMeta(total, pg));
});

export const getSession = asyncHandler(async (req, res) => {
  const key = req.params.id;
  const filter = /^[a-f\d]{24}$/i.test(key) ? { _id: key } : { slug: key };
  const s = await LiveSession.findOne(filter)
    .populate('trainer', 'displayName slug photo title shortBio')
    .populate('course', 'title slug');
  if (!s) throw ApiError.notFound('Session not found');
  if (!s.isPublished) {
    if (!req.user) throw ApiError.notFound('Session not found');
    await assertCanManage(req, { trainer: s.trainer?._id }).catch(() => {
      throw ApiError.notFound('Session not found');
    });
  }
  ok(res, await shape(req, s));
});

// Fields that change what learners are shown; a trainer editing any of these
// on an approved session sends it back to the manager for re-approval.
const REVIEWED_FIELDS = [
  'title', 'description', 'kind', 'startAt', 'endAt', 'youtubeUrl', 'youtubeId',
  'thumbnail', 'mode', 'venue', 'accessLevel', 'course', 'capacity', 'requiresRegistration',
];

async function notifyReviewers(session, message) {
  const reviewers = await User.find({ role: { $in: ['admin', 'manager'] }, isActive: true }).select('_id');
  await notify(reviewers.map((u) => u._id), {
    type: 'system',
    title: `Approval needed: ${session.title}`,
    message,
    link: '/manager/live-sessions',
  });
}

export const createSession = asyncHandler(async (req, res) => {
  const data = { ...req.body, createdBy: req.user._id };
  const byTrainer = !manageAll(req);
  if (byTrainer) {
    const tid = await trainerIdFor(req);
    if (!tid) throw ApiError.forbidden('A trainer profile is required');
    data.trainer = tid; // trainers can only create sessions for themselves
    // Never visible to learners until a manager approves it.
    data.isPublished = false;
    data.approvalStatus = 'pending';
  } else {
    data.approvalStatus = 'approved';
  }
  data.slug = await uniqueSlug(LiveSession, `${data.title}-${new Date(data.startAt).toISOString().slice(0, 10)}`);
  const s = await LiveSession.create(data);
  if (byTrainer) await notifyReviewers(s, `${req.user.name} submitted a new ${s.kind} for approval.`);
  created(res, s);
});

export const updateSession = asyncHandler(async (req, res) => {
  const s = await LiveSession.findById(req.params.id);
  if (!s) throw ApiError.notFound('Session not found');
  await assertCanManage(req, s);
  const data = { ...req.body };
  delete data.approvalStatus;
  let resubmitted = false;
  if (!manageAll(req)) {
    delete data.trainer;
    delete data.isPublished; // only a manager/admin can publish
    const touched = REVIEWED_FIELDS.some((f) => {
      if (data[f] === undefined) return false;
      const cur = s[f] instanceof Date ? s[f].getTime() : String(s[f] ?? '');
      const next = s[f] instanceof Date ? new Date(data[f]).getTime() : String(data[f] ?? '');
      return cur !== next;
    });
    if (touched && s.approvalStatus !== 'pending') {
      s.approvalStatus = 'pending';
      s.isPublished = false;
      s.rejectionReason = '';
      resubmitted = true;
    }
  } else if (data.isPublished === true && s.approvalStatus !== 'approved') {
    // A manager publishing a pending session counts as approving it.
    s.approvalStatus = 'approved';
    s.rejectionReason = '';
    s.reviewedBy = req.user._id;
    s.reviewedAt = new Date();
  }
  s.set(data);
  await s.save();
  if (resubmitted) await notifyReviewers(s, `${req.user.name} edited "${s.title}" and it needs re-approval.`);
  ok(res, s);
});

/** PATCH /api/live-sessions/:id/review  { decision: 'approve' | 'reject', reason? } */
export const reviewSession = asyncHandler(async (req, res) => {
  if (!manageAll(req)) throw ApiError.forbidden('Only a manager or admin can review sessions');
  const s = await LiveSession.findById(req.params.id).populate('trainer', 'user');
  if (!s) throw ApiError.notFound('Session not found');
  const { decision, reason = '' } = req.body;
  const approve = decision === 'approve';
  s.approvalStatus = approve ? 'approved' : 'rejected';
  s.isPublished = approve;
  s.rejectionReason = approve ? '' : String(reason).slice(0, 500);
  s.reviewedBy = req.user._id;
  s.reviewedAt = new Date();
  await s.save();
  if (s.trainer?.user) {
    await notify(s.trainer.user, {
      type: 'system',
      title: approve ? `Approved: ${s.title}` : `Not approved: ${s.title}`,
      message: approve
        ? 'Your session is now visible to learners.'
        : `Your session was not approved.${s.rejectionReason ? ` Reason: ${s.rejectionReason}` : ''}`,
      link: '/trainer/live-sessions',
    });
  }
  ok(res, s);
});

export const deleteSession = asyncHandler(async (req, res) => {
  const s = await LiveSession.findById(req.params.id);
  if (!s) throw ApiError.notFound('Session not found');
  await assertCanManage(req, s);
  await s.deleteOne();
  ok(res, { id: s.id });
});

export const register = asyncHandler(async (req, res) => {
  const s = await LiveSession.findOne({ _id: req.params.id, isPublished: true });
  if (!s) throw ApiError.notFound('Session not found');
  if (s.state === 'completed') throw ApiError.badRequest('This session has already ended');
  if (s.capacity && s.registrations.length >= s.capacity && !s.registrations.some((u) => u.equals(req.user._id))) {
    throw ApiError.conflict('This session is full');
  }
  await LiveSession.updateOne({ _id: s._id }, { $addToSet: { registrations: req.user._id } });
  await notify(req.user._id, {
    type: 'live_reminder',
    title: `You're registered: ${s.title}`,
    message: `Starts ${s.startAt.toUTCString()}`,
    link: `/live-sessions/${s.slug}`,
  });
  ok(res, { registered: true });
});

export const unregister = asyncHandler(async (req, res) => {
  await LiveSession.updateOne({ _id: req.params.id }, { $pull: { registrations: req.user._id } });
  ok(res, { registered: false });
});

/**
 * Sends reminders for sessions starting within the next hour. Called by an
 * interval in server.js; can be moved to a cron worker / queue later.
 */
export async function sendDueReminders() {
  const now = new Date();
  const soon = new Date(now.getTime() + 60 * 60 * 1000);
  const due = await LiveSession.find({ isPublished: true, startAt: { $gt: now, $lte: soon }, reminderSentAt: null });
  for (const s of due) {
    // eslint-disable-next-line no-await-in-loop
    await notify(s.registrations, {
      type: 'live_reminder',
      title: `Starting soon: ${s.title}`,
      message: 'Your live session begins within the hour.',
      link: `/live-sessions/${s.slug}`,
    }, { channels: ['email'] });
    s.reminderSentAt = now;
    // eslint-disable-next-line no-await-in-loop
    await s.save();
  }
  return due.length;
}
