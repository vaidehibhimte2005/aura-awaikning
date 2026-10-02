import { Certificate, Course, Enrollment, Lesson, LessonProgress } from '../models/index.js';
import { ApiError, asyncHandler, created, getPagination, ok, pageMeta } from '../utils/http.js';
import { enrollUser, recomputeProgress } from '../services/learningService.js';
import { hasCourseAccess } from '../services/accessService.js';

// ─── Enrollments ──────────────────────────────────────────

/** POST /api/enrollments { courseId } — free courses only. Paid courses go through checkout. */
export const enrollFree = asyncHandler(async (req, res) => {
  const course = await Course.findOne({ _id: req.body.courseId, status: 'published' });
  if (!course) throw ApiError.notFound('Course not found');
  if (course.price > 0) throw new ApiError(402, 'This is a paid course — please complete checkout');
  const { enrollment, created: isNew } = await enrollUser({ userId: req.user._id, courseId: course._id, source: 'free' });
  return isNew ? created(res, enrollment) : ok(res, enrollment);
});

export const myEnrollments = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id, status: { $ne: 'revoked' } };
  if (req.query.status) filter.status = String(req.query.status);
  const items = await Enrollment.find(filter)
    .sort({ lastAccessedAt: -1, createdAt: -1 })
    .populate({
      path: 'course',
      select: 'title slug coverImage lessonCount durationMinutes level trainers',
      populate: { path: 'trainers', select: 'displayName' },
    })
    .populate('lastLesson', 'title');
  ok(res, items.filter((e) => e.course));
});

/** Admin: list / grant / revoke enrollments. */
export const listEnrollments = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 25 });
  const filter = {};
  if (req.query.course) filter.course = req.query.course;
  if (req.query.user) filter.user = req.query.user;
  if (req.query.status) filter.status = String(req.query.status);
  const [items, total] = await Promise.all([
    Enrollment.find(filter)
      .populate('user', 'name email')
      .populate('course', 'title slug')
      .sort({ createdAt: -1 })
      .skip(pg.skip)
      .limit(pg.limit),
    Enrollment.countDocuments(filter),
  ]);
  ok(res, items, 200, pageMeta(total, pg));
});

export const grantEnrollment = asyncHandler(async (req, res) => {
  const { userId, courseId } = req.body;
  if (!userId || !courseId) throw ApiError.badRequest('userId and courseId are required');
  const { enrollment } = await enrollUser({ userId, courseId, source: 'admin' });
  created(res, enrollment);
});

export const updateEnrollment = asyncHandler(async (req, res) => {
  const status = req.body.status;
  if (!['active', 'revoked', 'completed'].includes(status)) throw ApiError.badRequest('Invalid status');
  const e = await Enrollment.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!e) throw ApiError.notFound();
  ok(res, e);
});

// ─── Progress ─────────────────────────────────────────────

/** POST /api/progress { lessonId, completed?, lastPositionSeconds? } */
export const updateProgress = asyncHandler(async (req, res) => {
  const lesson = await Lesson.findById(req.body.lessonId);
  if (!lesson) throw ApiError.notFound('Lesson not found');
  const course = await Course.findById(lesson.course);
  const enrolled = await Enrollment.findOne({ user: req.user._id, course: course._id, status: { $ne: 'revoked' } });
  if (!enrolled) {
    if (!(await hasCourseAccess(req, course))) throw ApiError.forbidden('Enroll to track progress');
    return ok(res, { tracked: false }); // staff previewing content
  }
  const update = { course: course._id };
  if (req.body.lastPositionSeconds !== undefined) update.lastPositionSeconds = req.body.lastPositionSeconds;
  if (req.body.completed !== undefined) {
    update.completed = req.body.completed;
    update.completedAt = req.body.completed ? new Date() : null;
  }
  const progress = await LessonProgress.findOneAndUpdate(
    { user: req.user._id, lesson: lesson._id },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await Enrollment.updateOne({ _id: enrolled._id }, { lastLesson: lesson._id, lastAccessedAt: new Date() });
  const result = await recomputeProgress(req.user._id, course._id);
  return ok(res, {
    progress,
    enrollment: result?.enrollment,
    certificate: result?.certificate ? { certificateNumber: result.certificate.certificateNumber } : null,
  });
});

/** GET /api/progress/:courseId — completed lessons + resume point. */
export const courseProgress = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findOne({ user: req.user._id, course: req.params.courseId });
  if (!enrollment) throw ApiError.notFound('Not enrolled');
  const items = await LessonProgress.find({ user: req.user._id, course: req.params.courseId }).select('lesson completed lastPositionSeconds');
  ok(res, { enrollment, lessons: items });
});

// ─── Certificates ─────────────────────────────────────────

export const myCertificates = asyncHandler(async (req, res) => {
  const items = await Certificate.find({ user: req.user._id, status: 'issued' }).populate('course', 'slug').sort({ completedAt: -1 });
  ok(res, items);
});

/** Public verification by certificate number. */
export const verifyCertificate = asyncHandler(async (req, res) => {
  const cert = await Certificate.findOne({ certificateNumber: req.params.number })
    .select('certificateNumber learnerName courseTitle trainerName completedAt status course')
    .populate('course', 'slug');
  if (!cert) throw ApiError.notFound('Certificate not found');
  ok(res, cert);
});

export const listCertificates = asyncHandler(async (req, res) => {
  const pg = getPagination(req.query, { defaultLimit: 25 });
  const [items, total] = await Promise.all([
    Certificate.find().sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit),
    Certificate.countDocuments(),
  ]);
  ok(res, items, 200, pageMeta(total, pg));
});
