import { Router } from 'express';
import { listActivity } from '../controllers/activityController.js';
import { protect, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../config/permissions.js';

export default Router().get('/', protect, requirePermission(P.AUDIT_READ), listActivity);
