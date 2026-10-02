import {
  Announcement,
  Article,
  Category,
  ContactMessage,
  FAQ,
  SiteSetting,
  Testimonial,
  User,
} from '../models/index.js';
import { crudFactory } from './crudFactory.js';
import { can, PERMISSIONS } from '../config/permissions.js';
import { ApiError, asyncHandler, created, ok } from '../utils/http.js';
import { notify } from '../services/notificationService.js';
import { DEFAULT_SETTINGS } from '../seed/defaultSettings.js';

const contentEditor = (req) => !!req.user && can(req.user, PERMISSIONS.CONTENT_MANAGE);

export const articles = crudFactory(Article, {
  searchFields: ['title', 'excerpt'],
  filterFields: ['category', 'status'],
  publicFilter: { status: 'published' },
  isEditor: contentEditor,
  slugFrom: 'title',
  defaultSort: { publishedAt: -1, createdAt: -1 },
  beforeCreate: (req, data) => {
    data.author = req.user._id;
    data.authorName ||= req.user.name;
  },
});

export const faqs = crudFactory(FAQ, {
  searchFields: ['question', 'answer'],
  filterFields: ['category'],
  publicFilter: { isPublished: true },
  isEditor: contentEditor,
  defaultSort: { category: 1, order: 1, createdAt: 1 },
});

export const testimonials = crudFactory(Testimonial, {
  searchFields: ['name', 'quote'],
  publicFilter: { isPublished: true },
  isEditor: contentEditor,
  defaultSort: { order: 1, createdAt: -1 },
  populate: { path: 'course', select: 'title slug' },
});

export const categories = crudFactory(Category, {
  searchFields: ['name'],
  slugFrom: 'name',
  defaultSort: { order: 1, name: 1 },
});

export const announcements = crudFactory(Announcement, {
  searchFields: ['title', 'message'],
  isEditor: contentEditor,
  publicFilter: { isActive: true },
  beforeCreate: (req, data) => {
    data.createdBy = req.user._id;
  },
  afterCreate: async (req, doc) => {
    if (!doc.notifyUsers || !doc.isActive) return;
    const roleFilter = { all: {}, learners: { role: 'learner' }, trainers: { role: 'trainer' } }[doc.audience] || {};
    const ids = await User.find({ ...roleFilter, isActive: true }).distinct('_id');
    await notify(ids, { type: 'announcement', title: doc.title, message: doc.message, link: doc.link || '' });
  },
});

/** Active banner announcements for the public site (time-window aware). */
export const activeAnnouncements = asyncHandler(async (_req, res) => {
  const now = new Date();
  const items = await Announcement.find({
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('title message link linkLabel showAsBanner audience');
  ok(res, items);
});

export const contactMessages = crudFactory(ContactMessage, {
  searchFields: ['name', 'email', 'subject', 'message'],
  filterFields: ['status'],
  isEditor: () => true,
});

export const submitContact = asyncHandler(async (req, res) => {
  const { website, ...data } = req.body; // honeypot already validated empty
  const msg = await ContactMessage.create(data);
  const staff = await User.find({ role: { $in: ['admin', 'manager'] }, isActive: true }).distinct('_id');
  await notify(staff, { type: 'system', title: 'New contact message', message: `${msg.name}: ${msg.subject || msg.message.slice(0, 80)}`, link: '/admin/messages' });
  created(res, { id: msg.id });
});

// ─── Site settings (CMS) ──────────────────────────────────
/** Which roles may edit which setting keys. */
const SETTING_ACCESS = {
  homepage: PERMISSIONS.CONTENT_MANAGE,
  about: PERMISSIONS.CONTENT_MANAGE,
  legal: PERMISSIONS.CONTENT_MANAGE,
  general: PERMISSIONS.SETTINGS_MANAGE,
};

export const publicSettings = asyncHandler(async (_req, res) => {
  const rows = await SiteSetting.find({ isPublic: true }).select('key value');
  const map = { ...DEFAULT_SETTINGS };
  rows.forEach((r) => {
    map[r.key] = { ...(DEFAULT_SETTINGS[r.key] || {}), ...r.value };
  });
  ok(res, map);
});

export const getSetting = asyncHandler(async (req, res) => {
  const row = await SiteSetting.findOne({ key: req.params.key });
  ok(res, { key: req.params.key, value: { ...(DEFAULT_SETTINGS[req.params.key] || {}), ...(row?.value || {}) } });
});

export const updateSetting = asyncHandler(async (req, res) => {
  const { key } = req.params;
  const perm = SETTING_ACCESS[key];
  if (!perm) throw ApiError.badRequest('Unknown setting');
  if (!can(req.user, perm)) throw ApiError.forbidden();
  const row = await SiteSetting.findOneAndUpdate(
    { key },
    { value: req.body.value, updatedBy: req.user._id, isPublic: true },
    { upsert: true, new: true },
  );
  ok(res, row);
});
