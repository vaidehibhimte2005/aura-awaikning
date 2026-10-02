import { Router } from 'express';
import * as c from '../controllers/userController.js';
import { protect, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { PERMISSIONS as P } from '../config/permissions.js';
import { adminUserSchema, adminUserUpdateSchema } from '../validators/schemas.js';

const r = Router();
r.use(protect);
r.get('/', requirePermission(P.USERS_READ, P.USERS_MANAGE), c.listUsers);
r.get('/:id', requirePermission(P.USERS_READ, P.USERS_MANAGE), c.getUser);
r.post('/', requirePermission(P.USERS_MANAGE), validate(adminUserSchema), c.createUser);
r.patch('/:id', requirePermission(P.USERS_MANAGE), validate(adminUserUpdateSchema), c.updateUser);
r.delete('/:id', requirePermission(P.USERS_MANAGE), c.deactivateUser);
export default r;
