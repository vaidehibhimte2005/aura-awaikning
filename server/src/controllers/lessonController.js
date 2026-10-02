import { Course, Enrollment, Lesson, LessonProgress } from '../models/index.js';
import { ApiError, asyncHandler, created, ok } from '../utils/http.js';
import { assertCanManageCourse, canManageCourse, hasCourseAccess } from '../services/accessService.js';
import { recalcCourseStats } from '../services/learningService.js';
import { notify } from '../services/notificationService.js';

/** GET /api/lessons?course=:id — management list (full fields) for authorised editors. */
export const listLessons = asyncHandler(async (req, res) => {
  if (!req.query.course) throw ApiError.badRequest('course query parameter is required');
  const course = await Course.findById(req.query.course);
  if (!course) throw ApiError.notFound('Course not found');
  if (!(await hasCourseAccess(req, course))) throw ApiError.forbidden();
  const manage = await canManageCourse(req, course);
  const lessons = await Lesson.find({ course: course._id, ...(manage ? {} : { isPublished: true }) }).sort({ order: 1, createdAt: 1 });
  ok(res, lessons, 200, { total: lessons.length, page: 1, pages: 1, limit: lessons.length });
});

/** GET /api/lessons/:id — a single lesson for the player (access-checked). */
export const getLesson = asyncHandler(async (req, res) => {
  const lesson = await Lesson.findById(req.params.id);
  if (!lesson) throw ApiError.notFound('Lesson not found');
  const course = await Course.findById(lesson.course);
  const manage = await canManageCourse(req, course);
  if (!lesson.isPublished && !manage) throw ApiError.notFound('Lesson not found');
  if (!lesson.isPreview && !(await hasCourseAccess(req, course))) {
    throw ApiError.forbidden('Enroll in this course to watch this lesson');
  }
  let progress = null;
  if (req.user) {
    progress = await LessonProgress.findOne({ user: req.user._id, lesson: lesson._id });
    await Enrollment.updateOne(
      { user: req.user._id, course: course._id },
      { lastLesson: lesson._id, lastAccessedAt: new Date() },
    );
  }
  ok(res, { lesson, progress });
});

export const createLesson = asyncHandler(async (req, res) => {
  const course = await assertCanManageCourse(req, req.body.course);
  const data = { ...req.body, createdBy: req.user._id };
  if (data.order === undefined) {
    const last = await Lesson.findOne({ course: course._id }).sort({ order: -1 }).select('order');
    data.order = (last?.order ?? 0) + 1;
  }
  const lesson = await Lesson.create(data);
  await recalcCourseStats(course._id);
  if (course.status === 'published' && lesson.isPublished) {
    const learners = await Enrollment.find({ course: course._id, status: 'active' }).distinct('user');
    await notify(learners, {
      type: 'lesson_new',
      title: `New lesson in ${course.title}`,
      message: lesson.title,
      link: `/learn/${course.slug}/${lesson._id}`,
    });
  }
  created(res, lesson);
});

export const updateLesson = asyncHandler(async (req, res) => {
  const lesson = await Lesson.findById(req.params.id);
  if (!lesson) throw ApiError.notFound('Lesson not found');
  await assertCanManageCourse(req, lesson.course);
  lesson.set(req.body);
  await lesson.save();
  await recalcCourseStats(lesson.course);
  ok(res, lesson);
});

export const deleteLesson = asyncHandler(async (req, res) => {
  const lesson = await Lesson.findById(req.params.id);
  if (!lesson) throw ApiError.notFound('Lesson not found');
  await assertCanManageCourse(req, lesson.course);
  await LessonProgress.deleteMany({ lesson: lesson._id });
  await lesson.deleteOne();
  await recalcCourseStats(lesson.course);
  ok(res, { id: lesson.id });
});

/** PUT /api/lessons/reorder { course, order: [lessonId…] } */
export const reorderLessons = asyncHandler(async (req, res) => {
  const course = await assertCanManageCourse(req, req.body.course);
  const ids = req.body.order;
  const count = await Lesson.countDocuments({ _id: { $in: ids }, course: course._id });
  if (count !== ids.length) throw ApiError.badRequest('All lessons must belong to this course');
  await Lesson.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { order: i + 1 } } })));
  ok(res, { reordered: ids.length });
});
