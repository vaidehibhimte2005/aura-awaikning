import { Router } from 'express';
import * as c from '../controllers/contentController.js';
import { optionalAuth, protect, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { contactLimiter } from '../middleware/rateLimit.js';
import { PERMISSIONS as P } from '../config/permissions.js';
import * as s from '../validators/schemas.js';

/** Standard CRUD router: public reads, permissioned writes. */
function crudRouter(handlers, schema, writePerm, { readPerm } = {}) {
  const r = Router();
  const read = readPerm ? [protect, requirePermission(readPerm)] : [optionalAuth];
  r.get('/', ...read, handlers.list);
  r.get('/:id', ...read, handlers.get);
  r.post('/', protect, requirePermission(writePerm), validate(schema), handlers.create);
  r.patch('/:id', protect, requirePermission(writePerm), validate(schema.partial ? schema.partial() : schema), handlers.update);
  r.delete('/:id', protect, requirePermission(writePerm), handlers.remove);
  return r;
}

export const articleRoutes = crudRouter(c.articles, s.articleSchema, P.CONTENT_MANAGE);
export const faqRoutes = crudRouter(c.faqs, s.faqSchema, P.CONTENT_MANAGE);
export const testimonialRoutes = crudRouter(c.testimonials, s.testimonialSchema, P.CONTENT_MANAGE);
export const categoryRoutes = crudRouter(c.categories, s.categorySchema, P.CATEGORIES_MANAGE);

export const announcementRoutes = Router()
  .get('/active', c.activeAnnouncements)
  .use(crudRouter(c.announcements, s.announcementSchema, P.CONTENT_MANAGE));

export const contactRoutes = Router()
  .post('/', contactLimiter, validate(s.contactSchema), c.submitContact)
  .get('/', protect, requirePermission(P.MESSAGES_READ), c.contactMessages.list)
  .patch('/:id', protect, requirePermission(P.MESSAGES_READ), validate(s.contactUpdateSchema), c.contactMessages.update)
  .delete('/:id', protect, requirePermission(P.SETTINGS_MANAGE), c.contactMessages.remove);

export const settingRoutes = Router()
  .get('/public', c.publicSettings)
  .get('/:key', protect, requirePermission(P.CONTENT_MANAGE, P.SETTINGS_MANAGE), c.getSetting)
  .put('/:key', protect, validate(s.settingSchema), c.updateSetting);
