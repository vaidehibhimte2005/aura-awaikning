import { Router } from 'express';
import * as t from '../controllers/trainingController.js';
import * as a from '../controllers/adminTrainingController.js';
import * as fbk from '../controllers/feedbackController.js';
import { feedbackSchema } from '../validators/training.js';
import { protect, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  adminLearnerUpdateSchema, adminTrainerCreateSchema, adminTrainerUpdateSchema, attendanceSchema, bookSchema, cancelSchema,
  cancelSubscriptionSchema, checkoutPackageSchema, configSchema, packageSchema, packageUpdateSchema, payoutIdsSchema,
  publishSlotsSchema, rescheduleSchema, resolveSchema, trainerSelfUpdateSchema,
} from '../validators/training.js';

const admin = [protect, requireRole('admin')];
const trainer = [protect, requireRole('trainer')];
const learner = [protect, requireRole('learner')];

/** Public pricing — computed from the admin's current settings. */
export const packageRoutes = Router()
  .get('/', t.publicPackages)
  .get('/admin/all', ...admin, t.adminListPackages)
  .post('/', ...admin, validate(packageSchema), t.createPackage)
  .patch('/:id', ...admin, validate(packageUpdateSchema), t.updatePackage)
  .delete('/:id', ...admin, t.deletePackage);

export const trainingConfigRoutes = Router()
  .get('/', ...admin, t.getTrainingConfig)
  .put('/', ...admin, validate(configSchema), t.putTrainingConfig);

export const subscriptionRoutes = Router()
  .get('/me', ...learner, t.mySubscriptions)
  .post('/checkout', ...learner, validate(checkoutPackageSchema), t.checkoutPackage);

export const slotRoutes = Router()
  .get('/trainers', protect, t.browseTrainers)
  .get('/available', protect, t.availableSlots)
  .get('/mine', ...trainer, t.mySlots)
  .post('/', ...trainer, validate(publishSlotsSchema), t.createSlots)
  .delete('/:id', ...trainer, t.removeSlot);

export const bookingRoutes = Router()
  .get('/me', protect, t.myBookings)
  .post('/', ...learner, validate(bookSchema), t.createBooking)
  .get('/:id', protect, t.getBooking)
  .post('/:id/cancel', protect, validate(cancelSchema), t.cancelMyBooking)
  .post('/:id/reschedule', protect, validate(rescheduleSchema), t.rescheduleMyBooking)
  .post('/:id/attendance', protect, validate(attendanceSchema), t.demoAttendance);

export const trainerSelfRoutes = Router()
  .get('/profile', ...trainer, t.myTrainerProfile)
  .patch('/profile', ...trainer, validate(trainerSelfUpdateSchema), t.updateMyTrainerProfile)
  .get('/earnings', ...trainer, t.myEarnings);

export const adminRoutes = Router()
  .use(...admin)
  .get('/overview', a.overview)
  .get('/trainers', a.listTrainers)
  .post('/trainers', validate(adminTrainerCreateSchema), a.createTrainer)
  .patch('/trainers/:id', validate(adminTrainerUpdateSchema), a.updateTrainer)
  .get('/learners', a.listLearners)
  .get('/learners/:id', a.getLearner)
  .patch('/learners/:id', validate(adminLearnerUpdateSchema), a.setLearnerActive)
  .get('/subscriptions', a.listSubscriptions)
  .post('/subscriptions/:id/cancel', validate(cancelSubscriptionSchema), a.cancelSubscription)
  .get('/bookings', a.listBookings)
  .post('/bookings/:id/resolve', validate(resolveSchema), a.resolve)
  .post('/bookings/:id/reevaluate', a.reevaluate)
  .get('/reports/sessions', a.sessionReport)
  .get('/payments', a.listPackagePayments)
  .get('/feedback', a.listFeedback)
  .get('/payouts', a.listPayouts)
  .post('/payouts/approve', validate(payoutIdsSchema), a.approvePayouts)
  .post('/payouts/mark-paid', validate(payoutIdsSchema), a.payPayouts)
  .post('/payouts/mark-failed', validate(payoutIdsSchema), a.failPayouts)
  .post('/payouts/reopen', validate(payoutIdsSchema), a.reopenPayouts);

export const feedbackRoutes = Router()
  .get('/trainer/:trainer', fbk.trainerFeedback)
  .get('/trainer/:trainer/mine', ...learner, fbk.mySessionsWithTrainer)
  .post('/', ...learner, validate(feedbackSchema), fbk.submitFeedback);
