import { Router } from 'express';
import { ApiError } from '../utils/http.js';

/**
 * Trainers cannot self-register: their accounts are created by an administrator
 * (POST /api/admin/trainers). The former public application workflow is retired, so
 * every request here is refused explicitly instead of silently 404-ing.
 */
const r = Router();
r.use((_req, _res, next) => next(ApiError.forbidden('Trainer accounts are created by an administrator. Self-registration is not available.')));
export default r;
