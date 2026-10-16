import crypto from 'crypto';
import { Certificate, Course, Enrollment, Lesson, LessonProgress, Trainer, User } from '../models/index.js';
import { notify, staffIds } from './notificationService.js';

/** Recalculate a course's lesson count & total duration after lesson changes. */
export async function recalcCourseStats(courseId) {
  const [stats] = await Lesson.aggregate([
    { $match: { course: courseId, isPublished: true } },
    { $group: { _id: null, count: { $sum: 1 }, minutes: { $sum: '$durationMinutes' } } },
  ]);
  await Course.updateOne(
    { _id: courseId },
    { lessonCount: stats?.count || 0, durationMinutes: stats?.minutes || 0 },
  );
}

/** Idempotent: returns the existing enrollment if one already exists. */
export async function enrollUser({ userId, courseId, source = 'free', orderId }) {
  const existing = await Enrollment.findOne({ user: userId, course: courseId });
  if (existing) {
    if (existing.status === 'revoked') {
      existing.status = existing.progressPercent >= 100 ? 'completed' : 'active';
      existing.source = source;
      if (orderId) existing.order = orderId;
      await existing.save();
    }
    return { enrollment: existing, created: false };
  }
  try {
    const enrollment = await Enrollment.create({ user: userId, course: courseId, source, order: orderId });
    await Course.updateOne({ _id: courseId }, { $inc: { enrollmentCount: 1 } });
    const course = await Course.findById(courseId).select('title slug trainers');
    const key = `enrollment:${enrollment._id}`;
    await notify(userId, {
      type: 'enrollment',
      title: `You're enrolled in ${course?.title || 'your course'}`,
      message: 'Your learning space is ready. Begin whenever you feel ready.',
      link: `/learn/${course?.slug || ''}`,
      related: { type: 'enrollment', id: enrollment._id },
      idempotencyKey: `${key}:learner`,
    }, { channels: ['email'] });
    // Trainer(s) and staff get visibility of every confirmed enrollment.
    const [learner, trainerUsers, staff] = await Promise.all([
      User.findById(userId).select('name'),
      Trainer.find({ _id: { $in: course?.trainers || [] } }).distinct('user'),
      staffIds(['admin']),
    ]);
    const msg = `${learner?.name || 'A learner'} enrolled in ${course?.title || 'a course'}.`;
    await notify(trainerUsers, { type: 'enrollment', title: 'New learner enrolled', message: msg, link: '/trainer/learners', related: { type: 'enrollment', id: enrollment._id }, idempotencyKey: `${key}:trainer` });
    await notify(staff, { type: 'enrollment', title: 'New enrollment', message: msg, link: '/admin/enrollments', related: { type: 'enrollment', id: enrollment._id }, idempotencyKey: `${key}:admin` });
    return { enrollment, created: true };
  } catch (err) {
    if (err.code === 11000) {
      return { enrollment: await Enrollment.findOne({ user: userId, course: courseId }), created: false };
    }
    throw err;
  }
}

function certificateNumber() {
  const year = new Date().getFullYear();
  return `AA-${year}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

export async function issueCertificate(enrollment) {
  const existing = await Certificate.findOne({ user: enrollment.user, course: enrollment.course });
  if (existing) return existing;
  const [user, course] = await Promise.all([
    User.findById(enrollment.user).select('name'),
    Course.findById(enrollment.course).populate('trainers', 'displayName'),
  ]);
  if (!course?.certificateEnabled) return null;
  const cert = await Certificate.create({
    certificateNumber: certificateNumber(),
    user: enrollment.user,
    course: enrollment.course,
    enrollment: enrollment._id,
    learnerName: user.name,
    courseTitle: course.title,
    trainerName: course.trainers.map((t) => t.displayName).join(', '),
    completedAt: enrollment.completedAt || new Date(),
  });
  await notify(enrollment.user, {
    type: 'certificate',
    title: 'Your certificate is ready',
    message: `Congratulations on completing ${course.title}.`,
    link: `/certificates/${cert.certificateNumber}`,
  });
  return cert;
}

/** Recompute enrollment progress from LessonProgress; issues a certificate at 100%. */
export async function recomputeProgress(userId, courseId) {
  const enrollment = await Enrollment.findOne({ user: userId, course: courseId });
  if (!enrollment) return null;
  const lessonIds = await Lesson.find({ course: courseId, isPublished: true }).distinct('_id');
  const completed = lessonIds.length
    ? await LessonProgress.countDocuments({ user: userId, lesson: { $in: lessonIds }, completed: true })
    : 0;
  const percent = lessonIds.length ? Math.round((completed / lessonIds.length) * 100) : 0;
  enrollment.completedLessons = completed;
  enrollment.progressPercent = percent;
  if (percent >= 100 && enrollment.status !== 'completed') {
    enrollment.status = 'completed';
    enrollment.completedAt = new Date();
  } else if (percent < 100 && enrollment.status === 'completed') {
    enrollment.status = 'active';
    enrollment.completedAt = undefined;
  }
  await enrollment.save();
  let certificate = null;
  if (enrollment.status === 'completed') certificate = await issueCertificate(enrollment);
  return { enrollment, certificate };
}
