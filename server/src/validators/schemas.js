import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const optStr = (max = 5000) => z.string().trim().max(max).optional();
const strList = z.array(z.string().trim().max(300)).max(50).optional();
const url = z.string().trim().max(1000).optional().or(z.literal(''));
const bool = z.coerce.boolean().optional();

// ─── Auth ─────────────────────────────────────────────────
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Please enter your name').max(80),
    email: z.string().trim().toLowerCase().email('Please enter a valid email'),
    password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email'),
  password: z.string().min(1, 'Please enter your password'),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(20).optional(),
  bio: optStr(600),
  avatar: url,
  notificationPrefs: z
    .object({ email: bool, sms: bool, whatsapp: bool, push: bool })
    .partial()
    .optional(),
});

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1), newPassword: password, confirmPassword: z.string() })
  .refine((d) => d.newPassword === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

// ─── Users (admin) ────────────────────────────────────────
export const adminUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: password.optional(),
  role: z.enum(['admin', 'manager', 'trainer', 'learner']).optional(),
  isActive: bool,
  extraPermissions: z.array(z.string()).optional(),
  phone: z.string().trim().max(20).optional(),
});
export const adminUserUpdateSchema = adminUserSchema.partial();

// ─── Catalog ──────────────────────────────────────────────
export const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: optStr(500),
  order: z.coerce.number().optional(),
});

const videoInput = z
  .object({ youtubeUrl: url, youtubeId: optStr(20), videoType: z.enum(['video', 'live', 'recording']).optional(), durationMinutes: z.coerce.number().min(0).optional() })
  .partial();

export const courseSchema = z.object({
  title: z.string().trim().min(3).max(140),
  slug: optStr(90),
  shortDescription: optStr(300),
  description: optStr(20000),
  coverImage: url,
  category: objectId.optional().or(z.literal('')).transform((v) => v || undefined),
  level: z.enum(['beginner', 'intermediate', 'advanced', 'all']).optional(),
  language: optStr(40),
  trainers: z.array(objectId).max(10).optional(),
  price: z.coerce.number().min(0).max(10000000).optional(),
  compareAtPrice: z.coerce.number().min(0).optional(),
  currency: z.string().trim().length(3).optional(),
  previewVideo: videoInput.optional(),
  requirements: strList,
  outcomes: strList,
  tags: strList,
  status: z.enum(['draft', 'published', 'archived']).optional(),
  isFeatured: bool,
  certificateEnabled: bool,
  seo: z.object({ metaTitle: optStr(70), metaDescription: optStr(170) }).partial().optional(),
});
export const courseUpdateSchema = courseSchema.partial();

const resourceInput = z.object({
  title: z.string().trim().min(1).max(160),
  url: z.string().trim().min(1).max(1000),
  kind: z.enum(['link', 'pdf', 'audio', 'image', 'document']).optional(),
});

export const lessonSchema = z.object({
  course: objectId,
  section: optStr(120),
  title: z.string().trim().min(2).max(160),
  description: optStr(5000),
  notes: optStr(20000),
  youtubeUrl: url,
  youtubeId: optStr(20),
  videoType: z.enum(['video', 'live', 'recording']).optional(),
  durationMinutes: z.coerce.number().min(0).max(1000).optional(),
  order: z.coerce.number().optional(),
  isPreview: bool,
  isPublished: bool,
  resources: z.array(resourceInput).max(30).optional(),
});
export const lessonUpdateSchema = lessonSchema.omit({ course: true }).partial();
export const reorderSchema = z.object({ course: objectId, order: z.array(objectId).min(1).max(500) });

export const progressSchema = z.object({
  lessonId: objectId,
  completed: z.boolean().optional(),
  lastPositionSeconds: z.coerce.number().min(0).optional(),
});

// ─── Trainers ─────────────────────────────────────────────
export const trainerSchema = z.object({
  user: objectId.optional(),
  // Allows admin to create the login + profile in one step
  name: optStr(80),
  email: z.string().trim().toLowerCase().email().optional(),
  password: password.optional(),
  displayName: z.string().trim().min(2).max(80),
  title: optStr(120),
  bio: optStr(5000),
  shortBio: optStr(240),
  photo: url,
  specialties: strList,
  experienceYears: z.coerce.number().min(0).max(80).optional(),
  socials: z.object({ website: url, instagram: url, youtube: url, linkedin: url }).partial().optional(),
  isPublished: bool,
  order: z.coerce.number().optional(),
});
export const trainerUpdateSchema = trainerSchema.omit({ user: true, email: true, password: true, name: true }).partial();

// ─── Live sessions / events ───────────────────────────────
export const liveSessionSchema = z.object({
  kind: z.enum(['session', 'event']).optional(),
  title: z.string().trim().min(3).max(160),
  description: optStr(10000),
  trainer: objectId.optional().or(z.literal('')).transform((v) => v || undefined),
  course: objectId.optional().or(z.literal('')).transform((v) => v || undefined),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  timezone: optStr(60),
  youtubeUrl: url,
  youtubeId: optStr(20),
  recordingUrl: url,
  thumbnail: url,
  mode: z.enum(['online', 'in_person', 'hybrid']).optional(),
  venue: optStr(300),
  liveStatus: z.enum(['auto', 'live', 'ended']).optional(),
  isPublished: bool,
  requiresRegistration: bool,
  accessLevel: z.enum(['public', 'registered', 'enrolled']).optional(),
  capacity: z.coerce.number().min(0).optional(),
});
export const liveSessionUpdateSchema = liveSessionSchema.partial();

// ─── Checkout ─────────────────────────────────────────────
export const checkoutSchema = z.object({ courseId: objectId });
export const verifySchema = z.object({ orderId: objectId, payload: z.record(z.any()).optional() });
export const failSchema = z.object({ orderId: objectId, reason: optStr(300) });

// ─── Content ──────────────────────────────────────────────
export const articleSchema = z.object({
  title: z.string().trim().min(3).max(180),
  slug: optStr(90),
  excerpt: optStr(400),
  body: optStr(100000),
  coverImage: url,
  category: optStr(60),
  tags: strList,
  authorName: optStr(80),
  readMinutes: z.coerce.number().min(1).max(120).optional(),
  status: z.enum(['draft', 'published']).optional(),
  seo: z.object({ metaTitle: optStr(70), metaDescription: optStr(170) }).partial().optional(),
});
export const faqSchema = z.object({
  question: z.string().trim().min(5).max(300),
  answer: z.string().trim().min(2).max(5000),
  category: optStr(60),
  order: z.coerce.number().optional(),
  isPublished: bool,
});
export const testimonialSchema = z.object({
  name: z.string().trim().min(2).max(80),
  role: optStr(120),
  quote: z.string().trim().min(10).max(600),
  avatar: url,
  rating: z.coerce.number().min(1).max(5).optional(),
  course: objectId.optional().or(z.literal('')).transform((v) => v || undefined),
  isPublished: bool,
  order: z.coerce.number().optional(),
});
export const announcementSchema = z.object({
  title: z.string().trim().min(3).max(160),
  message: z.string().trim().min(3).max(2000),
  link: optStr(500),
  linkLabel: optStr(60),
  audience: z.enum(['all', 'learners', 'trainers']).optional(),
  showAsBanner: bool,
  startsAt: z.coerce.date().optional().or(z.literal('')).transform((v) => v || undefined),
  endsAt: z.coerce.date().optional().or(z.literal('')).transform((v) => v || undefined),
  isActive: bool,
  notifyUsers: bool,
});
export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(80),
  email: z.string().trim().toLowerCase().email('Please enter a valid email'),
  phone: optStr(20),
  subject: optStr(160),
  message: z.string().trim().min(10, 'Please write at least a sentence').max(4000),
  website: z.string().max(0).optional(), // honeypot — must stay empty
});
export const contactUpdateSchema = z.object({ status: z.enum(['new', 'read', 'replied', 'archived']) });

export const settingSchema = z.object({ value: z.record(z.any()) });

export const partial = (s) => s.partial();
