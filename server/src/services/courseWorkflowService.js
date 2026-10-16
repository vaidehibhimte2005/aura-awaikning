import { Course, Lesson, Trainer } from '../models/index.js';
import { notify, staffIds } from './notificationService.js';
import { logActivity } from './activityService.js';

/** Statuses in which a course may be changed by its trainer without losing review state. */
export const EDITABLE_STATUSES = ['draft', 'rejected', 'needs_revision'];
/** Statuses where learners see (or a reviewer is looking at) the current content. */
export const REVIEWED_STATUSES = ['pending_approval', 'under_review', 'approved', 'published'];

export const trainerUserIds = (course) => Trainer.find({ _id: { $in: course.trainers || [] } }).distinct('user');

/** Appends to the course's status history and logs it to the audit trail. */
export async function recordTransition(course, { to, by, reason = '', action }) {
  const from = course.status;
  course.statusHistory.push({ from, to, by: by?._id || by, reason, at: new Date() });
  course.status = to;
  await logActivity({
    actor: by,
    action: action || `course.${to}`,
    entityType: 'course',
    entity: course,
    entityLabel: course.title,
    from,
    to,
    reason: reason || undefined,
  });
  return from;
}

/**
 * A trainer changed content that reviewers (or learners) have already seen.
 * Never expose unreviewed changes: pull the course back to draft so it must be
 * re-submitted and re-approved. Enrolled learners keep their access.
 */
export async function pullBackForReview(course, by) {
  if (!REVIEWED_STATUSES.includes(course.status)) return false;
  course.revision += 1;
  course.approvedAt = undefined;
  course.approvedBy = undefined;
  await recordTransition(course, {
    to: 'draft',
    by,
    reason: 'Edited after review — needs to be re-submitted for approval',
    action: 'course.edited_after_review',
  });
  return true;
}

/** What must exist before a course may be submitted. Returns a list of problems. */
export async function submissionProblems(course) {
  const problems = [];
  if (!course.title?.trim()) problems.push('Course title is required');
  if (!course.shortDescription?.trim()) problems.push('Short description is required');
  if (!course.description || course.description.trim().length < 50) problems.push('Detailed description should be at least 50 characters');
  if (!course.category) problems.push('Choose a category');
  if (!course.coverImage) problems.push('Add a cover image');
  if (course.price == null || course.price < 0) problems.push('Set a valid price (0 for free)');
  if (course.compareAtPrice && course.compareAtPrice < course.price) problems.push('Original price must be higher than the selling price');
  if (!course.outcomes?.length) problems.push('Add at least one learning objective');
  const lessons = await Lesson.countDocuments({ course: course._id });
  if (lessons < 1) problems.push('Add at least one lesson');
  return problems;
}

export async function notifyCourseEvent(course, { event, actor, reason = '' }) {
  const [trainers, managers, admins] = await Promise.all([trainerUserIds(course), staffIds(['manager']), staffIds(['admin'])]);
  const base = { type: 'course_review', related: { type: 'course', id: course._id } };
  const stamp = `${course._id}:${course.revision}:${course.statusHistory.length}`;
  const staffLink = '/manager/course-approvals';
  const trainerLink = '/trainer/courses';
  const msgs = {
    submitted: {
      to: [...managers, ...admins],
      title: 'Course submitted for approval',
      message: `${actor?.name || 'A trainer'} submitted “${course.title}”.`,
      link: staffLink,
    },
    under_review: { to: [...trainers, ...admins], title: 'Course under review', message: `“${course.title}” is being reviewed.`, link: trainerLink },
    approved: { to: [...trainers, ...admins], title: 'Course approved', message: `“${course.title}” was approved. You can now publish it.`, link: trainerLink },
    rejected: { to: [...trainers, ...admins], title: 'Course rejected', message: `“${course.title}” was rejected. Reason: ${reason}`, link: trainerLink },
    needs_revision: { to: [...trainers, ...admins], title: 'Changes requested', message: `“${course.title}”: ${reason}`, link: trainerLink },
    published: { to: [...admins], title: 'Course published', message: `“${course.title}” is now live in the marketplace.`, link: '/admin/courses' },
  }[event];
  if (!msgs) return;
  await notify(msgs.to, { ...base, title: msgs.title, message: msgs.message, link: msgs.link, idempotencyKey: `course:${event}:${stamp}` }, { channels: event === 'submitted' ? [] : ['email'] });
}

/**
 * Compare-and-set status change: succeeds only if the course is still in one of
 * `from`, so concurrent reviewers / retried requests can't double-apply a decision.
 * Returns the updated course, or null when the precondition no longer holds.
 */
export async function atomicTransition(course, { from, to, by, reason = '', action, set = {} }) {
  const updated = await Course.findOneAndUpdate(
    { _id: course._id, status: { $in: from } },
    {
      $set: { status: to, ...set },
      $push: { statusHistory: { from: course.status, to, by: by?._id || by, reason, at: new Date() } },
    },
    { new: true },
  );
  if (updated) {
    await logActivity({
      actor: by,
      action: action || `course.${to}`,
      entityType: 'course',
      entity: updated,
      entityLabel: updated.title,
      from: course.status,
      to,
      reason: reason || undefined,
    });
  }
  return updated;
}
