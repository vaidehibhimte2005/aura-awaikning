import { Router } from 'express';
import * as c from '../controllers/lessonController.js';
import { optionalAuth, protect, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { PERMISSIONS as P } from '../config/permissions.js';
import { lessonSchema, lessonUpdateSchema, reorderSchema } from '../validators/schemas.js';

const canEdit = requirePermission(P.COURSES_MANAGE_ALL, P.COURSES_MANAGE_OWN);
const r = Router();
r.get('/', protect, c.listLessons);
r.put('/reorder', protect, canEdit, validate(reorderSchema), c.reorderLessons);
r.get('/:id', optionalAuth, c.getLesson);
r.post('/', protect, canEdit, validate(lessonSchema), c.createLesson);
r.patch('/:id', protect, canEdit, validate(lessonUpdateSchema), c.updateLesson);
r.delete('/:id', protect, canEdit, c.deleteLesson);
export default r;
