import { Router } from 'express';
import * as c from '../controllers/learningController.js';
import { protect, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { PERMISSIONS as P } from '../config/permissions.js';
import { progressSchema } from '../validators/schemas.js';
import { z } from 'zod';

export const enrollmentRoutes = Router()
  .post('/', protect, validate(z.object({ courseId: z.string().regex(/^[a-f\d]{24}$/i) })), c.enrollFree)
  .get('/me', protect, c.myEnrollments)
  .get('/', protect, requirePermission(P.ENROLLMENTS_MANAGE), c.listEnrollments)
  .post('/grant', protect, requirePermission(P.ENROLLMENTS_MANAGE), c.grantEnrollment)
  .patch('/:id', protect, requirePermission(P.ENROLLMENTS_MANAGE), c.updateEnrollment);

export const progressRoutes = Router()
  .post('/', protect, validate(progressSchema), c.updateProgress)
  .get('/:courseId', protect, c.courseProgress);

export const certificateRoutes = Router()
  .get('/me', protect, c.myCertificates)
  .get('/', protect, requirePermission(P.ENROLLMENTS_MANAGE), c.listCertificates)
  .get('/verify/:number', c.verifyCertificate);
