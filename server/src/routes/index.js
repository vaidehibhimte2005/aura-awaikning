import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import trainerRoutes from './trainer.routes.js';
import courseRoutes from './course.routes.js';
import trainerApplicationRoutes from './trainerApplication.routes.js';
import activityRoutes from './activity.routes.js';
import lessonRoutes from './lesson.routes.js';
import liveRoutes from './live.routes.js';
import { certificateRoutes, enrollmentRoutes, progressRoutes } from './learning.routes.js';
import { orderRoutes, paymentRoutes } from './payment.routes.js';
import {
  announcementRoutes,
  articleRoutes,
  categoryRoutes,
  contactRoutes,
  faqRoutes,
  settingRoutes,
  testimonialRoutes,
} from './content.routes.js';
import { dashboardRoutes, notificationRoutes, uploadRoutes } from './misc.routes.js';
import { feedbackRoutes, adminRoutes, bookingRoutes, packageRoutes, slotRoutes, subscriptionRoutes, trainerSelfRoutes, trainingConfigRoutes } from './training.routes.js';
import { sitemap } from '../controllers/miscController.js';

const api = Router();
api.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } }));
api.use('/auth', authRoutes);
api.use('/users', userRoutes);
api.use('/trainer', trainerSelfRoutes);
api.use('/trainers', trainerRoutes);
api.use('/packages', packageRoutes);
api.use('/training-config', trainingConfigRoutes);
api.use('/subscriptions', subscriptionRoutes);
api.use('/slots', slotRoutes);
api.use('/bookings', bookingRoutes);
api.use('/feedback', feedbackRoutes);
api.use('/admin', adminRoutes);
api.use('/trainer-applications', trainerApplicationRoutes);
api.use('/activity-logs', activityRoutes);
api.use('/courses', courseRoutes);
api.use('/categories', categoryRoutes);
api.use('/lessons', lessonRoutes);
api.use('/enrollments', enrollmentRoutes);
api.use('/progress', progressRoutes);
api.use('/live-sessions', liveRoutes);
api.use('/payments', paymentRoutes);
api.use('/orders', orderRoutes);
api.use('/certificates', certificateRoutes);
api.use('/articles', articleRoutes);
api.use('/faqs', faqRoutes);
api.use('/testimonials', testimonialRoutes);
api.use('/announcements', announcementRoutes);
api.use('/notifications', notificationRoutes);
api.use('/settings', settingRoutes);
api.use('/contact', contactRoutes);
api.use('/dashboard', dashboardRoutes);
api.use('/uploads', uploadRoutes);
api.get('/sitemap.xml', sitemap);

export default api;
