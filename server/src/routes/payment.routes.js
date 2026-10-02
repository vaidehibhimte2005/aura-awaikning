import { Router } from 'express';
import * as c from '../controllers/paymentController.js';
import { protect, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { PERMISSIONS as P } from '../config/permissions.js';
import { checkoutSchema, failSchema, verifySchema } from '../validators/schemas.js';

// NOTE: /webhook/:provider is mounted separately in app.js with a raw body parser.
export const paymentRoutes = Router()
  .get('/config', c.config)
  .post('/checkout', protect, validate(checkoutSchema), c.checkout)
  .post('/verify', protect, validate(verifySchema), c.verify)
  .post('/fail', protect, validate(failSchema), c.fail)
  .get('/me', protect, c.myPayments)
  .get('/', protect, requirePermission(P.PAYMENTS_READ), c.listPayments)
  .post('/:id/refund', protect, requirePermission(P.PAYMENTS_REFUND), c.refund);

export const orderRoutes = Router()
  .get('/', protect, requirePermission(P.PAYMENTS_READ), c.listOrders)
  .get('/:id', protect, c.getMyOrder);
