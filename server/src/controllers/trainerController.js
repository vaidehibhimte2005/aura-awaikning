import { Course, Enrollment, LiveSession, Trainer, User } from '../models/index.js';
import { ApiError, asyncHandler, created, escapeRegex, getPagination, ok, pageMeta } from '../utils/http.js';
import { uniqueSlug } from '../utils/slugify.js';
import { can, PERMISSIONS } from '../config/permissions.js';
import { trainerIdFor } from '../services/accessService.js';
import { ratingsFor } from '../services/training/ratingService.js';

const isEditor = (req) => req.user && can(req.user, PERMISSIONS.TRAINERS_MANAGE);

export const listTrainers = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 24 });
  const filter = isEditor(req) && req.query.all === 'true' ? {} : { isPublished: true };
  if (req.query.q) filter.displayName = new RegExp(escapeRegex(String(req.query.q).slice(0, 60)), 'i');
  const [items, total] = await Promise.all([
    Trainer.find(filter).sort({ order: 1, createdAt: 1 }).skip(pg.skip).limit(pg.limit).populate('user', 'email isActive'),
    Trainer.countDocuments(filter),
  ]);
  // Only editors may see trainer login emails.
  const ratings = await ratingsFor(items.map((t) => t.user?._id).filter(Boolean));
  const data = items.map((t) => {
    const o = t.toObject();
    o.rating = ratings.get(String(t.user?._id)) || { average: null, count: 0 };
    if (!isEditor(req)) delete o.user;
    return o;
  });
  ok(res, data, 200, pageMeta(total, pg));
});

export const getTrainer = asyncHandler(async (req, res) => {
  const key = req.params.id;
  const filter = /^[a-f\d]{24}$/i.test(key) ? { _id: key } : { slug: key };
  if (!isEditor(req)) filter.isPublished = true;
  const trainer = await Trainer.findOne(filter);
  if (!trainer) throw ApiError.notFound('Trainer not found');
  const [courses, sessions] = await Promise.all([
    Course.find({ trainers: trainer._id, status: 'published' })
      .select('title slug coverImage shortDescription price currency level lessonCount durationMinutes category')
      .populate('category', 'name slug'),
    LiveSession.find({ trainer: trainer._id, isPublished: true, endAt: { $gte: new Date() } }).sort({ startAt: 1 }).limit(4),
  ]);
  ok(res, { trainer, courses, sessions });
});

export const createTrainer = asyncHandler(async (req, res) => {
  const { user: userId, name, email, password, ...profile } = req.body;
  let user;
  if (userId) {
    user = await User.findById(userId);
    if (!user) throw ApiError.notFound('User not found');
  } else {
    if (!email || !password) throw ApiError.badRequest('Provide an existing user or an email and password for the trainer login');
    if (await User.exists({ email })) throw ApiError.conflict('An account with this email already exists');
    user = await User.create({ name: name || profile.displayName, email, password, role: 'trainer' });
  }
  if (await Trainer.exists({ user: user._id })) throw ApiError.conflict('This user already has a trainer profile');
  if (user.role === 'learner') {
    user.role = 'trainer';
    await user.save();
  }
  const trainer = await Trainer.create({ ...profile, user: user._id, slug: await uniqueSlug(Trainer, profile.displayName) });
  created(res, trainer);
});

export const updateTrainer = asyncHandler(async (req, res) => {
  const trainer = await Trainer.findById(req.params.id);
  if (!trainer) throw ApiError.notFound('Trainer not found');
  // Trainers may edit their own public profile (but not publish/unpublish or reorder it).
  const own = (await trainerIdFor(req))?.toString() === trainer.id;
  if (!isEditor(req) && !own) throw ApiError.forbidden();
  const data = { ...req.body };
  if (!isEditor(req)) {
    delete data.isPublished;
    delete data.order;
  }
  if (data.displayName && data.displayName !== trainer.displayName) {
    data.slug = await uniqueSlug(Trainer, data.displayName, trainer._id);
  }
  trainer.set(data);
  await trainer.save();
  ok(res, trainer);
});

export const deleteTrainer = asyncHandler(async (req, res) => {
  const trainer = await Trainer.findById(req.params.id);
  if (!trainer) throw ApiError.notFound('Trainer not found');
  const inUse = await Course.exists({ trainers: trainer._id });
  if (inUse) throw ApiError.conflict('This trainer is assigned to courses. Unassign them first or unpublish the profile.');
  await trainer.deleteOne();
  ok(res, { id: trainer.id });
});

/** Trainer's own profile + learners across their courses. */
export const myTrainerProfile = asyncHandler(async (req, res) => {
  const tid = await trainerIdFor(req);
  if (!tid) throw ApiError.notFound('No trainer profile is linked to your account yet');
  ok(res, await Trainer.findById(tid));
});

export const myLearners = asyncHandler(async (req, res) => {
  const tid = await trainerIdFor(req);
  if (!tid) throw ApiError.notFound('No trainer profile');
  const courseIds = await Course.find({ trainers: tid }).distinct('_id');
  const pg = getPagination(req.query, { defaultLimit: 25 });
  const filter = { course: { $in: courseIds }, ...(req.query.course ? { course: req.query.course } : {}) };
  if (req.query.course && !courseIds.some((c) => c.toString() === req.query.course)) throw ApiError.forbidden();
  const [items, total] = await Promise.all([
    Enrollment.find(filter)
      .populate('user', 'name email avatar')
      .populate('course', 'title slug')
      .sort({ createdAt: -1 })
      .skip(pg.skip)
      .limit(pg.limit),
    Enrollment.countDocuments(filter),
  ]);
  ok(res, items, 200, pageMeta(total, pg));
});
