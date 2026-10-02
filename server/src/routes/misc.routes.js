import { Router } from 'express';
import multer from 'multer';
import * as c from '../controllers/miscController.js';
import { protect, requirePermission, requireRole } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../config/permissions.js';
import { env } from '../config/env.js';
import { ALLOWED_TYPES } from '../services/storageService.js';

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.storage.maxMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(ALLOWED_TYPES[file.mimetype] ? null : Object.assign(new Error('File type not allowed'), { status: 400 }), !!ALLOWED_TYPES[file.mimetype]),
});

export const dashboardRoutes = Router()
  .get('/admin', protect, requireRole('admin'), c.adminDashboard)
  .get('/manager', protect, requirePermission(P.CONTENT_MANAGE), c.managerDashboard)
  .get('/trainer', protect, requireRole('trainer'), c.trainerDashboard)
  .get('/learner', protect, c.learnerDashboard);

export const notificationRoutes = Router()
  .get('/', protect, c.myNotifications)
  .patch('/:id/read', protect, c.markRead)
  .post('/broadcast', protect, requirePermission(P.NOTIFY_BROADCAST), c.broadcast);

export const uploadRoutes = Router().post('/', protect, requirePermission(P.UPLOADS_CREATE), uploader.single('file'), c.upload);
