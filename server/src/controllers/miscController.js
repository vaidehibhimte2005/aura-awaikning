import {
  Article,
  Certificate,
  Course,
  Enrollment,
  LiveSession,
  Notification,
  Payment,
  Trainer,
  TrainerApplication,
  User,
  ActivityLog,
} from '../models/index.js';
import { ApiError, asyncHandler, created, escapeRegex, getPagination, ok, pageMeta } from '../utils/http.js';
import { trainerIdFor } from '../services/accessService.js';
import { storeFile } from '../services/storageService.js';
import { notify } from '../services/notificationService.js';
import { env } from '../config/env.js';

// ─── Dashboards ───────────────────────────────────────────
async function workflowMetrics() {
  const [apps, courses, learners, approvedTrainers, recentActivity] = await Promise.all([
    TrainerApplication.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Course.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.countDocuments({ role: 'learner' }),
    Trainer.countDocuments({ isPublished: true }),
    ActivityLog.find().sort({ createdAt: -1 }).limit(8).populate('actor', 'name role'),
  ]);
  const a = Object.fromEntries(apps.map((x) => [x._id, x.count]));
  const c = Object.fromEntries(courses.map((x) => [x._id, x.count]));
  return {
    trainerApplications: {
      total: apps.reduce((n, x) => n + x.count, 0),
      pending: (a.PENDING || 0) + (a.UNDER_REVIEW || 0) + (a.NEEDS_INFORMATION || 0),
      awaitingDecision: (a.PENDING || 0) + (a.UNDER_REVIEW || 0),
      approved: a.APPROVED || 0,
      rejected: a.REJECTED || 0,
    },
    courses: {
      pendingApproval: (c.pending_approval || 0) + (c.under_review || 0),
      published: c.published || 0,
      rejected: (c.rejected || 0) + (c.needs_revision || 0),
    },
    registeredLearners: learners,
    approvedTrainers,
    recentActivity,
  };
}

export const adminDashboard = asyncHandler(async (_req, res) => {
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86400000);
  const [
    totalUsers,
    activeLearners,
    trainers,
    courses,
    enrollments,
    revenue,
    revenue30,
    upcomingSessions,
    recentPayments,
    signupsByDay,
  ] = await Promise.all([
    User.countDocuments(),
    Enrollment.distinct('user', { status: 'active', lastAccessedAt: { $gte: monthAgo } }).then((r) => r.length),
    Trainer.countDocuments(),
    Course.countDocuments({ status: { $ne: 'archived' } }),
    Enrollment.countDocuments(),
    Payment.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: '$currency', total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { status: 'paid', paidAt: { $gte: monthAgo } } }, { $group: { _id: '$currency', total: { $sum: '$amount' } } }]),
    LiveSession.find({ isPublished: true, startAt: { $gte: now } }).sort({ startAt: 1 }).limit(5).populate('trainer', 'displayName'),
    Payment.find().sort({ createdAt: -1 }).limit(8).populate('user', 'name email').populate('course', 'title'),
    User.aggregate([
      { $match: { createdAt: { $gte: monthAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  ok(res, {
    totals: { totalUsers, activeLearners, trainers, courses, enrollments },
    revenue,
    revenue30,
    upcomingSessions,
    recentPayments,
    signupsByDay,
    workflow: await workflowMetrics(),
  });
});

export const trainerDashboard = asyncHandler(async (req, res) => {
  const tid = await trainerIdFor(req);
  if (!tid) return ok(res, { hasProfile: false, courses: [], sessions: [], learnerCount: 0 });
  const courses = await Course.find({ trainers: tid }).select('title slug status reviewNote lessonCount enrollmentCount coverImage updatedAt');
  const ids = courses.map((c) => c._id);
  const byStatus = courses.reduce((m, c) => ({ ...m, [c.status]: (m[c.status] || 0) + 1 }), {});
  const [learnerCount, avg, sessions, revenue, recentNotifications] = await Promise.all([
    Enrollment.countDocuments({ course: { $in: ids } }),
    Enrollment.aggregate([{ $match: { course: { $in: ids } } }, { $group: { _id: null, avg: { $avg: '$progressPercent' } } }]),
    LiveSession.find({ trainer: tid, endAt: { $gte: new Date() } }).sort({ startAt: 1 }).limit(5),
    // Gross verified sales of this trainer's courses (paid payments only).
    Payment.aggregate([
      { $match: { course: { $in: ids }, status: 'paid' } },
      { $group: { _id: '$currency', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(5).select('title message link readAt createdAt'),
  ]);
  return ok(res, {
    hasProfile: true,
    courses,
    sessions,
    learnerCount,
    averageProgress: Math.round(avg[0]?.avg || 0),
    counts: {
      total: courses.length,
      published: byStatus.published || 0,
      pendingApproval: (byStatus.pending_approval || 0) + (byStatus.under_review || 0),
      rejected: (byStatus.rejected || 0) + (byStatus.needs_revision || 0),
    },
    revenue,
    recentNotifications,
  });
});

export const learnerDashboard = asyncHandler(async (req, res) => {
  const uid = req.user._id;
  const [enrollments, certificates, sessions, unread] = await Promise.all([
    Enrollment.find({ user: uid, status: { $ne: 'revoked' } })
      .sort({ lastAccessedAt: -1, createdAt: -1 })
      .populate('course', 'title slug coverImage lessonCount durationMinutes')
      .populate('lastLesson', 'title'),
    Certificate.countDocuments({ user: uid, status: 'issued' }),
    LiveSession.find({ isPublished: true, endAt: { $gte: new Date() } })
      .sort({ startAt: 1 })
      .limit(3)
      .populate('trainer', 'displayName')
      .select('-registrations'),
    Notification.countDocuments({ user: uid, readAt: null }),
  ]);
  const list = enrollments.filter((e) => e.course);
  ok(res, {
    inProgress: list.filter((e) => e.status === 'active'),
    completed: list.filter((e) => e.status === 'completed'),
    continueLearning: list.find((e) => e.status === 'active') || null,
    certificateCount: certificates,
    upcomingSessions: sessions.map((s) => s.toObject({ virtuals: true })),
    unreadNotifications: unread,
  });
});

export const managerDashboard = asyncHandler(async (_req, res) => {
  const workflow = await workflowMetrics();
  const now = new Date();
  const [articles, drafts, upcoming, live] = await Promise.all([
    Article.countDocuments({ status: 'published' }),
    Article.countDocuments({ status: 'draft' }),
    LiveSession.countDocuments({ startAt: { $gte: now } }),
    LiveSession.find({ endAt: { $gte: now } }).sort({ startAt: 1 }).limit(5).populate('trainer', 'displayName'),
  ]);
  ok(res, { articles, drafts, upcomingSessions: upcoming, sessions: live, workflow });
});

/** GET /api/dashboard/learners — learner directory + enrollment overview for staff (audit:read). */
export const learnerDirectory = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 20 });
  const filter = { role: 'learner' };
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  const [users, total, byStatus] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).select('name email phone location interests emailVerified isActive createdAt'),
    User.countDocuments(filter),
    Enrollment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  const counts = await Enrollment.aggregate([
    { $match: { user: { $in: users.map((u) => u._id) } } },
    { $group: { _id: '$user', count: { $sum: 1 } } },
  ]);
  const byUser = new Map(counts.map((c) => [c._id.toString(), c.count]));
  const data = users.map((u) => ({ ...u.toObject(), enrollmentCount: byUser.get(u.id) || 0 }));
  ok(res, data, 200, { ...pageMeta(total, pg), enrollments: Object.fromEntries(byStatus.map((s2) => [s2._id, s2.count])) });
});

// ─── Notifications ────────────────────────────────────────
export const myNotifications = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 20 });
  const filter = { user: req.user._id };
  if (req.query.unread === 'true') filter.readAt = null;
  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).select('-deliveries'),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: req.user._id, readAt: null }),
  ]);
  ok(res, items, 200, { ...pageMeta(total, pg), unread });
});

export const markRead = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id, readAt: null };
  if (req.params.id !== 'all') filter._id = req.params.id;
  const r = await Notification.updateMany(filter, { readAt: new Date() });
  ok(res, { updated: r.modifiedCount });
});

export const broadcast = asyncHandler(async (req, res) => {
  const { title, message, link, role } = req.body || {};
  if (!title) throw ApiError.badRequest('Title is required');
  const ids = await User.find({ isActive: true, ...(role ? { role } : {}) }).distinct('_id');
  await notify(ids, { type: 'announcement', title, message: message || '', link: link || '' });
  ok(res, { sent: ids.length });
});

// ─── Uploads ──────────────────────────────────────────────
export const upload = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No file received');
  const folder = String(req.query.folder || 'misc');
  const stored = await storeFile(req.file, folder);
  created(res, { ...stored, name: req.file.originalname, size: req.file.size, type: req.file.mimetype });
});

// ─── SEO ──────────────────────────────────────────────────
export const sitemap = asyncHandler(async (_req, res) => {
  const [courses, articles, trainers] = await Promise.all([
    Course.find({ status: 'published' }).select('slug updatedAt'),
    Article.find({ status: 'published' }).select('slug updatedAt'),
    Trainer.find({ isPublished: true }).select('slug updatedAt'),
  ]);
  const staticPaths = ['', '/about', '/courses', '/trainers', '/live-sessions', '/events', '/articles', '/contact', '/faq', '/privacy-policy', '/terms', '/refund-policy'];
  const urls = [
    ...staticPaths.map((p) => ({ loc: `${env.siteUrl}${p}` })),
    ...courses.map((c) => ({ loc: `${env.siteUrl}/courses/${c.slug}`, lastmod: c.updatedAt })),
    ...articles.map((a) => ({ loc: `${env.siteUrl}/articles/${a.slug}`, lastmod: a.updatedAt })),
    ...trainers.map((t) => ({ loc: `${env.siteUrl}/trainers/${t.slug}`, lastmod: t.updatedAt })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString()}</lastmod>` : ''}</url>`)
    .join('\n')}\n</urlset>`;
  res.type('application/xml').send(xml);
});
