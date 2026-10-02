import { Course, Enrollment, Trainer } from '../models/index.js';
import { can, PERMISSIONS, ROLES } from '../config/permissions.js';
import { ApiError } from '../utils/http.js';

/** Returns the Trainer profile id for a trainer user (cached on req). */
export async function trainerIdFor(req) {
  if (!req.user || req.user.role !== ROLES.TRAINER) return null;
  if (req._trainerId !== undefined) return req._trainerId;
  const t = await Trainer.findOne({ user: req.user._id }).select('_id');
  req._trainerId = t?._id || null;
  return req._trainerId;
}

/**
 * Full edit access to a course's curriculum: admins (or anyone with
 * courses:manage_all), or a trainer assigned to that course.
 */
export async function canManageCourse(req, course) {
  if (!req.user) return false;
  if (can(req.user, PERMISSIONS.COURSES_MANAGE_ALL)) return true;
  if (can(req.user, PERMISSIONS.COURSES_MANAGE_OWN)) {
    const tid = await trainerIdFor(req);
    return !!tid && course.trainers.some((t) => (t._id || t).toString() === tid.toString());
  }
  return false;
}

export async function assertCanManageCourse(req, courseOrId) {
  const course = courseOrId?.trainers ? courseOrId : await Course.findById(courseOrId);
  if (!course) throw ApiError.notFound('Course not found');
  if (!(await canManageCourse(req, course))) throw ApiError.forbidden('You can only manage courses assigned to you');
  return course;
}

/** Whether the current user may watch non-preview lessons of the course. */
export async function hasCourseAccess(req, course) {
  if (!req.user) return false;
  if (await canManageCourse(req, course)) return true;
  if (can(req.user, PERMISSIONS.COURSES_PRESENTATION)) return true; // managers can review content
  const e = await Enrollment.exists({ user: req.user._id, course: course._id, status: { $in: ['active', 'completed'] } });
  return !!e;
}
