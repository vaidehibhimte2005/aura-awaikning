import { Router } from 'express';
import * as c from '../controllers/courseController.js';
import { optionalAuth, protect, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { PERMISSIONS as P } from '../config/permissions.js';
import { courseReviewSchema, courseSchema, courseUpdateSchema } from '../validators/schemas.js';

const r = Router();
r.get('/', optionalAuth, c.listCourses);
r.get('/:id', optionalAuth, c.getCourse);
r.get('/:id/stats', protect, c.courseStats);
r.post('/', protect, requirePermission(P.COURSES_MANAGE_ALL, P.COURSES_MANAGE_OWN), validate(courseSchema), c.createCourse);
r.patch('/:id', protect, requirePermission(P.COURSES_MANAGE_ALL, P.COURSES_MANAGE_OWN, P.COURSES_PRESENTATION), validate(courseUpdateSchema), c.updateCourse);
r.delete('/:id', protect, requirePermission(P.COURSES_MANAGE_ALL), c.deleteCourse);
// Approval workflow — each endpoint re-checks authorisation and state on the server.
r.post('/:id/submit', protect, requirePermission(P.COURSES_MANAGE_ALL, P.COURSES_MANAGE_OWN), c.submitCourse);
r.post('/:id/review', protect, requirePermission(P.COURSES_REVIEW), validate(courseReviewSchema), c.reviewCourse);
r.post('/:id/publish', protect, requirePermission(P.COURSES_MANAGE_ALL, P.COURSES_MANAGE_OWN), c.publishCourse);
r.post('/:id/unpublish', protect, requirePermission(P.COURSES_MANAGE_ALL, P.COURSES_MANAGE_OWN), c.unpublishCourse);
r.get('/:id/history', protect, c.courseHistory);
export default r;
