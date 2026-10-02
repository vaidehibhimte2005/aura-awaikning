import { Category, Course, Enrollment, Lesson, LessonProgress } from '../models/index.js';
import { ApiError, asyncHandler, created, escapeRegex, getPagination, ok, pageMeta, pick } from '../utils/http.js';
import { uniqueSlug } from '../utils/slugify.js';
import { can, PERMISSIONS } from '../config/permissions.js';
import { assertCanManageCourse, canManageCourse, hasCourseAccess, trainerIdFor } from '../services/accessService.js';
import { recalcCourseStats } from '../services/learningService.js';

const LIST_FIELDS =
  'title slug shortDescription coverImage category level trainers price compareAtPrice currency lessonCount durationMinutes enrollmentCount isFeatured status publishedAt createdAt';

/** Fields the Content & Live Manager may edit (presentation, not curriculum or price). */
const PRESENTATION_FIELDS = ['shortDescription', 'description', 'coverImage', 'previewVideo', 'outcomes', 'requirements', 'tags', 'isFeatured', 'seo'];
/** Fields a trainer may edit on an assigned course (no price / publishing / trainer assignment). */
const TRAINER_FIELDS = ['title', 'shortDescription', 'description', 'coverImage', 'previewVideo', 'outcomes', 'requirements', 'tags', 'level', 'language', 'category'];

/**
 * GET /api/courses
 * Public: published only. `?scope=manage` returns what the caller can manage
 * (all for admin/manager, assigned for trainers) including drafts.
 */
export const listCourses = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 12, maxLimit: 60 });
  const filter = {};
  const manage = req.query.scope === 'manage' && req.user;

  if (manage) {
    if (can(req.user, PERMISSIONS.COURSES_MANAGE_ALL) || can(req.user, PERMISSIONS.COURSES_PRESENTATION)) {
      if (req.query.status) filter.status = String(req.query.status);
    } else if (can(req.user, PERMISSIONS.COURSES_MANAGE_OWN)) {
      const tid = await trainerIdFor(req);
      if (!tid) return ok(res, [], 200, pageMeta(0, pg));
      filter.trainers = tid;
      if (req.query.status) filter.status = String(req.query.status);
    } else {
      throw ApiError.forbidden();
    }
  } else {
    filter.status = 'published';
  }

  if (req.query.category) {
    const cat = /^[a-f\d]{24}$/i.test(req.query.category)
      ? { _id: req.query.category }
      : { slug: String(req.query.category) };
    const c = await Category.findOne(cat).select('_id');
    filter.category = c?._id || null;
  }
  if (req.query.level) filter.level = String(req.query.level);
  // Never let a query param widen a trainer's own scope.
  if (req.query.trainer && !filter.trainers) filter.trainers = String(req.query.trainer);
  if (req.query.price === 'free') filter.price = 0;
  if (req.query.price === 'paid') filter.price = { $gt: 0 };
  if (req.query.featured === 'true') filter.isFeatured = true;
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), 'i');
    filter.$or = [{ title: rx }, { shortDescription: rx }, { tags: rx }];
  }

  const sorts = {
    newest: { publishedAt: -1, createdAt: -1 },
    price_asc: { price: 1, createdAt: -1 },
    price_desc: { price: -1, createdAt: -1 },
    popular: { enrollmentCount: -1 },
    featured: { isFeatured: -1, publishedAt: -1 },
  };
  const sort = sorts[req.query.sort] || sorts.featured;

  const [items, total] = await Promise.all([
    Course.find(filter)
      .select(LIST_FIELDS)
      .sort(sort)
      .skip(pg.skip)
      .limit(pg.limit)
      .populate('category', 'name slug')
      .populate('trainers', 'displayName slug photo title'),
    Course.countDocuments(filter),
  ]);
  ok(res, items, 200, pageMeta(total, pg));
});

/**
 * GET /api/courses/:slugOrId — course details + curriculum.
 * Video IDs of locked lessons are never sent to users without access.
 */
export const getCourse = asyncHandler(async (req, res) => {
  const key = req.params.id;
  const filter = /^[a-f\d]{24}$/i.test(key) ? { _id: key } : { slug: key };
  const course = await Course.findOne(filter)
    .populate('category', 'name slug')
    .populate('trainers', 'displayName slug photo title shortBio');
  if (!course) throw ApiError.notFound('Course not found');

  const manager = await canManageCourse(req, course);
  const presenter = req.user && can(req.user, PERMISSIONS.COURSES_PRESENTATION);
  if (course.status !== 'published' && !manager && !presenter) throw ApiError.notFound('Course not found');

  const access = await hasCourseAccess(req, course);
  const lessonFilter = { course: course._id };
  if (!manager) lessonFilter.isPublished = true;
  const lessons = await Lesson.find(lessonFilter)
    .sort({ order: 1, createdAt: 1 })
    .select('title section description durationMinutes order isPreview isPublished youtubeId youtubeUrl videoType resources');

  let enrollment = null;
  let progressMap = {};
  if (req.user) {
    enrollment = await Enrollment.findOne({ user: req.user._id, course: course._id });
    if (enrollment) {
      const prog = await LessonProgress.find({ user: req.user._id, course: course._id, completed: true }).select('lesson');
      progressMap = Object.fromEntries(prog.map((p) => [p.lesson.toString(), true]));
    }
  }

  const curriculum = lessons.map((l) => {
    const unlocked = access || l.isPreview;
    return {
      _id: l._id,
      title: l.title,
      section: l.section,
      description: l.description,
      durationMinutes: l.durationMinutes,
      order: l.order,
      isPreview: l.isPreview,
      isPublished: l.isPublished,
      locked: !unlocked,
      completed: !!progressMap[l._id.toString()],
      ...(unlocked ? { youtubeId: l.youtubeId, videoType: l.videoType } : {}),
    };
  });

  ok(res, {
    course,
    curriculum,
    access: { canWatch: access, canManage: manager, isEnrolled: !!enrollment && enrollment.status !== 'revoked' },
    enrollment,
  });
});

export const createCourse = asyncHandler(async (req, res) => {
  const data = { ...req.body, createdBy: req.user._id };
  data.slug = await uniqueSlug(Course, data.slug || data.title);
  if (!can(req.user, PERMISSIONS.COURSES_MANAGE_ALL)) {
    // Trainers create drafts assigned to themselves; admin publishes & prices.
    const tid = await trainerIdFor(req);
    if (!tid) throw ApiError.forbidden('A trainer profile is required to create courses');
    data.trainers = [tid];
    data.status = 'draft';
    delete data.price;
    delete data.isFeatured;
  }
  const course = await Course.create(data);
  created(res, course);
});

export const updateCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw ApiError.notFound('Course not found');

  let data;
  if (can(req.user, PERMISSIONS.COURSES_MANAGE_ALL)) {
    data = { ...req.body };
  } else if (await canManageCourse(req, course)) {
    data = pick(req.body, TRAINER_FIELDS);
  } else if (can(req.user, PERMISSIONS.COURSES_PRESENTATION)) {
    data = pick(req.body, PRESENTATION_FIELDS);
  } else {
    throw ApiError.forbidden('You can only manage courses assigned to you');
  }

  if (data.slug !== undefined || (data.title && data.title !== course.title && course.status === 'draft')) {
    data.slug = await uniqueSlug(Course, data.slug || data.title, course._id);
  }
  if (data.previewVideo) data.previewVideo = { ...course.previewVideo?.toObject?.(), ...data.previewVideo };
  course.set(data);
  await course.save();
  ok(res, course);
});

/** Archive instead of hard-delete when learners are enrolled, to protect their history. */
export const deleteCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw ApiError.notFound('Course not found');
  const hasLearners = await Enrollment.exists({ course: course._id });
  if (hasLearners) {
    course.status = 'archived';
    await course.save();
    return ok(res, { id: course.id, archived: true });
  }
  await Lesson.deleteMany({ course: course._id });
  await course.deleteOne();
  return ok(res, { id: course.id, deleted: true });
});

export const courseStats = asyncHandler(async (req, res) => {
  const course = await assertCanManageCourse(req, req.params.id);
  const [byStatus, avg] = await Promise.all([
    Enrollment.aggregate([{ $match: { course: course._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Enrollment.aggregate([{ $match: { course: course._id } }, { $group: { _id: null, avg: { $avg: '$progressPercent' } } }]),
  ]);
  await recalcCourseStats(course._id);
  ok(res, {
    enrollments: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
    averageProgress: Math.round(avg[0]?.avg || 0),
  });
});
