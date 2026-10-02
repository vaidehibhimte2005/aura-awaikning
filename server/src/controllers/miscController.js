import {
  Article,
  Certificate,
  Course,
  Enrollment,
  LiveSession,
  Notification,
  Payment,
  Trainer,
  User,
} from '../models/index.js';
import { ApiError, asyncHandler, created, getPagination, ok, pageMeta } from '../utils/http.js';
import { trainerIdFor } from '../services/accessService.js';
import { storeFile } from '../services/storageService.js';
import { notify } from '../services/notificationService.js';
import { env } from '../config/env.js';

// ─── Dashboards ───────────────────────────────────────────
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
  });
});

export const trainerDashboard = asyncHandler(async (req, res) => {
  const tid = await trainerIdFor(req);
  if (!tid) return ok(res, { hasProfile: false, courses: [], sessions: [], learnerCount: 0 });
  const courses = await Course.find({ trainers: tid }).select('title slug status lessonCount enrollmentCount coverImage updatedAt');
  const ids = courses.map((c) => c._id);
  const [learnerCount, avg, sessions] = await Promise.all([
    Enrollment.countDocuments({ course: { $in: ids } }),
    Enrollment.aggregate([{ $match: { course: { $in: ids } } }, { $group: { _id: null, avg: { $avg: '$progressPercent' } } }]),
    LiveSession.find({ trainer: tid, endAt: { $gte: new Date() } }).sort({ startAt: 1 }).limit(5),
  ]);
  return ok(res, { hasProfile: true, courses, sessions, learnerCount, averageProgress: Math.round(avg[0]?.avg || 0) });
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
  const now = new Date();
  const [articles, drafts, upcoming, live] = await Promise.all([
    Article.countDocuments({ status: 'published' }),
    Article.countDocuments({ status: 'draft' }),
    LiveSession.countDocuments({ startAt: { $gte: now } }),
    LiveSession.find({ endAt: { $gte: now } }).sort({ startAt: 1 }).limit(5).populate('trainer', 'displayName'),
  ]);
  ok(res, { articles, drafts, upcomingSessions: upcoming, sessions: live });
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
