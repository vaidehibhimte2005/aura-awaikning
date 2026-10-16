import { Category, Course, Enrollment, Lesson, LessonProgress, User } from '../models/index.js';
import { ApiError, asyncHandler, created, escapeRegex, getPagination, ok, pageMeta, pick } from '../utils/http.js';
import { logActivity } from '../services/activityService.js';
import { uniqueSlug } from '../utils/slugify.js';
import { can, PERMISSIONS } from '../config/permissions.js';
import { assertCanManageCourse, canManageCourse, hasCourseAccess, trainerIdFor } from '../services/accessService.js';
import { recalcCourseStats } from '../services/learningService.js';
import {
  atomicTransition,
  EDITABLE_STATUSES,
  notifyCourseEvent,
  pullBackForReview,
  submissionProblems,
} from '../services/courseWorkflowService.js';

const LIST_FIELDS =
  'title slug shortDescription coverImage category level trainers price compareAtPrice currency lessonCount durationMinutes enrollmentCount isFeatured isDemo status submittedAt reviewNote publishedAt createdAt';

/** Fields the Content & Live Manager may edit (presentation, not curriculum or price). */
const PRESENTATION_FIELDS = ['shortDescription', 'description', 'coverImage', 'previewVideo', 'outcomes', 'requirements', 'tags', 'isFeatured', 'seo'];
/** Fields a trainer may edit on an assigned course (no price / publishing / trainer assignment). */
const TRAINER_FIELDS = ['title', 'shortDescription', 'description', 'coverImage', 'previewVideo', 'outcomes', 'requirements', 'tags', 'level', 'language', 'category', 'price', 'compareAtPrice', 'targetAudience', 'refundPolicy'];

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
  if (course.status !== 'published' && !manager && !presenter) {
    // Learners who already own the course keep access if it was later pulled back for re-review.
    const owns = req.user && (await Enrollment.exists({ user: req.user._id, course: course._id, status: { $ne: 'revoked' } }));
    if (!owns || course.status === 'archived') throw ApiError.notFound('Course not found');
  }

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
    // Trainers create drafts assigned to themselves; a manager must approve before publication.
    const tid = await trainerIdFor(req);
    if (!tid) throw ApiError.forbidden('A trainer profile is required to create courses');
    data.trainers = [tid];
    data.status = 'draft';
    data.currency = 'INR';
    delete data.isFeatured;
    delete data.certificateEnabled;
    delete data.seo;
  }
  const course = await Course.create(data);
  await logActivity({ actor: req.user, action: 'course.created', entityType: 'course', entity: course, entityLabel: course.title, to: course.status });
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

  // Status only ever changes through the workflow endpoints (submit / review / publish).
  delete data.status;
  const isStaffEdit = can(req.user, PERMISSIONS.COURSES_MANAGE_ALL);

  if (data.slug !== undefined || (data.title && data.title !== course.title && course.status === 'draft')) {
    data.slug = await uniqueSlug(Course, data.slug || data.title, course._id);
  }
  if (data.previewVideo) data.previewVideo = { ...course.previewVideo?.toObject?.(), ...data.previewVideo };

  // A trainer touching reviewed/live content pulls it back to draft: unapproved changes never go public.
  const pulledBack = !isStaffEdit && (await trainerChangedContent(course, data)) && (await pullBackForReview(course, req.user));
  course.set(data);
  await course.save();
  ok(res, { ...course.toObject(), pulledBack });
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

/** True when applying `data` would change at least one field. */
async function trainerChangedContent(course, data) {
  return Object.entries(data).some(([k, v]) => {
    if (v === undefined) return false;
    const cur = course[k];
    if (Array.isArray(cur) || (cur && typeof cur === 'object' && !(cur instanceof Date) && !cur._bsontype)) {
      return JSON.stringify(cur?.toObject?.() ?? cur) !== JSON.stringify(v);
    }
    return String(cur ?? '') !== String(v ?? '');
  });
}

// ─── Approval workflow ────────────────────────────────────

const ownsCourse = async (req, course) => !can(req.user, PERMISSIONS.COURSES_MANAGE_ALL) && (await canManageCourse(req, course));

/** POST /api/courses/:id/submit — the owning trainer sends the course for approval. */
export const submitCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw ApiError.notFound('Course not found');
  if (!(await ownsCourse(req, course)) && !can(req.user, PERMISSIONS.COURSES_MANAGE_ALL)) throw ApiError.forbidden('You can only submit your own courses');
  if (!EDITABLE_STATUSES.includes(course.status)) {
    throw ApiError.conflict(`This course is ${course.status.replace('_', ' ')} and cannot be submitted right now`);
  }
  const problems = await submissionProblems(course);
  if (problems.length) throw ApiError.badRequest('Please complete the course before submitting', { problems });

  const updated = await atomicTransition(course, {
    from: EDITABLE_STATUSES,
    to: 'pending_approval',
    by: req.user,
    action: 'course.submitted',
    set: { submittedAt: new Date(), reviewNote: '' },
  });
  if (!updated) throw ApiError.conflict('This course was already submitted');
  await notifyCourseEvent(updated, { event: 'submitted', actor: req.user });
  ok(res, updated);
});

const REVIEW_RULES = {
  start_review: { from: ['pending_approval'], to: 'under_review', event: 'under_review' },
  approve: { from: ['pending_approval', 'under_review'], to: 'approved', event: 'approved' },
  reject: { from: ['pending_approval', 'under_review'], to: 'rejected', event: 'rejected', reasonRequired: true },
  request_changes: { from: ['pending_approval', 'under_review'], to: 'needs_revision', event: 'needs_revision', reasonRequired: true },
};

/** POST /api/courses/:id/review — managers only (courses:review); trainers can never approve. */
export const reviewCourse = asyncHandler(async (req, res) => {
  const { decision, reason = '' } = req.body;
  const rule = REVIEW_RULES[decision];
  if (rule.reasonRequired && !reason.trim()) throw ApiError.badRequest('A reason or description of the changes is required');

  const course = await Course.findById(req.params.id);
  if (!course) throw ApiError.notFound('Course not found');
  // A reviewer who is also the author may not approve their own work.
  if (course.createdBy?.equals(req.user._id) && decision !== 'start_review') {
    throw ApiError.forbidden('You cannot review a course you created');
  }
  if (!rule.from.includes(course.status)) {
    throw ApiError.conflict(`This course is ${course.status.replace('_', ' ')} and cannot be reviewed that way`);
  }
  const now = new Date();
  const set = { reviewedBy: req.user._id, reviewedAt: now };
  if (decision === 'approve') Object.assign(set, { approvedAt: now, approvedBy: req.user._id, reviewNote: '' });
  else if (decision !== 'start_review') set.reviewNote = reason.trim();

  const updated = await atomicTransition(course, {
    from: rule.from,
    to: rule.to,
    by: req.user,
    reason: reason.trim(),
    action: `course.${rule.event}`,
    set,
  });
  if (!updated) throw ApiError.conflict('Someone else just reviewed this course — refresh and try again');
  await notifyCourseEvent(updated, { event: rule.event, actor: req.user, reason: reason.trim() });
  ok(res, updated);
});

/** POST /api/courses/:id/publish — owner publishes an APPROVED course. */
export const publishCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw ApiError.notFound('Course not found');
  const staff = can(req.user, PERMISSIONS.COURSES_MANAGE_ALL);
  if (!staff && !(await ownsCourse(req, course))) throw ApiError.forbidden('You can only publish your own courses');

  let allowed = course.status === 'approved';
  if (!allowed && staff && course.status === 'draft' && !course.submittedAt) {
    // Staff-authored content never went through trainer review; trainer-authored courses always do.
    const author = course.createdBy ? await User.findById(course.createdBy).select('role') : null;
    allowed = !author || author.role !== 'trainer';
  }
  if (!allowed) throw ApiError.conflict('Only courses approved by a manager can be published');

  const updated = await atomicTransition(course, {
    from: [course.status],
    to: 'published',
    by: req.user,
    action: 'course.published',
    set: { publishedAt: new Date() },
  });
  if (!updated) throw ApiError.conflict('This course changed while publishing — refresh and try again');
  await notifyCourseEvent(updated, { event: 'published', actor: req.user });
  ok(res, updated);
});

/** POST /api/courses/:id/unpublish — take a live course off the marketplace (stays approved). */
export const unpublishCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw ApiError.notFound('Course not found');
  if (!(await canManageCourse(req, course))) throw ApiError.forbidden();
  if (course.status !== 'published') throw ApiError.conflict('This course is not published');
  const updated = await atomicTransition(course, { from: ['published'], to: 'approved', by: req.user, action: 'course.unpublished' });
  if (!updated) throw ApiError.conflict('This course is no longer published');
  ok(res, updated);
});

/** GET /api/courses/:id/history — approval trail for the owner and staff. */
export const courseHistory = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id)
    .select('title status statusHistory submittedAt approvedAt approvedBy publishedAt reviewNote')
    .populate('statusHistory.by', 'name role')
    .populate('approvedBy', 'name');
  if (!course) throw ApiError.notFound('Course not found');
  const staff = can(req.user, PERMISSIONS.AUDIT_READ) || can(req.user, PERMISSIONS.COURSES_REVIEW);
  if (!staff && !(await canManageCourse(req, course))) throw ApiError.forbidden();
  ok(res, course);
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
