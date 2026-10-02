import { Router } from 'express';
import * as c from '../controllers/trainerController.js';
import { optionalAuth, protect, requirePermission, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { PERMISSIONS as P } from '../config/permissions.js';
import { trainerSchema, trainerUpdateSchema } from '../validators/schemas.js';

const r = Router();
r.get('/', optionalAuth, c.listTrainers);
r.get('/me/profile', protect, requireRole('trainer'), c.myTrainerProfile);
r.get('/me/learners', protect, requireRole('trainer'), c.myLearners);
r.get('/:id', optionalAuth, c.getTrainer);
r.post('/', protect, requirePermission(P.TRAINERS_MANAGE), validate(trainerSchema), c.createTrainer);
r.patch('/:id', protect, validate(trainerUpdateSchema), c.updateTrainer); // ownership checked in controller
r.delete('/:id', protect, requirePermission(P.TRAINERS_MANAGE), c.deleteTrainer);
export default r;
