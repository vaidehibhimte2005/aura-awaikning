import { Router } from 'express';
import * as c from '../controllers/liveSessionController.js';
import { optionalAuth, protect, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { PERMISSIONS as P } from '../config/permissions.js';
import { liveSessionReviewSchema, liveSessionSchema, liveSessionUpdateSchema } from '../validators/schemas.js';

const canManage = requirePermission(P.LIVE_MANAGE_ALL, P.LIVE_MANAGE_OWN);
const r = Router();
r.get('/', optionalAuth, c.listSessions);
r.get('/:id', optionalAuth, c.getSession);
r.post('/', protect, canManage, validate(liveSessionSchema), c.createSession);
r.patch('/:id', protect, canManage, validate(liveSessionUpdateSchema), c.updateSession);
r.patch('/:id/review', protect, requirePermission(P.LIVE_MANAGE_ALL), validate(liveSessionReviewSchema), c.reviewSession);
r.delete('/:id', protect, canManage, c.deleteSession);
r.post('/:id/register', protect, c.register);
r.delete('/:id/register', protect, c.unregister);
export default r;
