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

/** Accepts "+91 98765-43210" style input; stores digits with an optional leading +. */
const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-().]/g, ''))
  .refine((v) => /^\+?\d{7,15}$/.test(v), 'Please enter a valid mobile number');
const email = z.string().trim().toLowerCase().email('Please enter a valid email');
const mustAccept = (msg) => z.literal(true, { errorMap: () => ({ message: msg }) });
const reqStr = (label, max = 120) => z.string().trim().min(1, `${label} is required`).max(max);

const passwordPair = (shape) =>
  z.object({ ...shape, password, confirmPassword: z.string() }).refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const registerSchema = passwordPair({
  name: z.string().trim().min(2, 'Please enter your name').max(80),
  email,
  phone,
  country: optStr(60),
  state: optStr(60),
  city: optStr(60),
  interests: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  learningGoals: optStr(1000),
  acceptTerms: mustAccept('You must accept the Terms and Conditions'),
  acceptPrivacy: mustAccept('You must accept the Privacy Policy'),
});

const trainerSocials = z
  .object({ website: url, instagram: url, youtube: url, linkedin: url, facebook: url, other: url })
  .partial()
  .optional();

const trainerProfileFields = {
  photo: url,
  country: reqStr('Country', 60),
  state: reqStr('State', 60),
  city: reqStr('City', 60),
  gender: optStr(30),
  dateOfBirth: z.coerce.date().optional().or(z.literal('')).transform((v) => v || undefined),
  displayName: z.string().trim().min(2, 'Display name is required').max(80),
  title: z.string().trim().min(3, 'Professional headline is required').max(120),
  shortBio: z.string().trim().min(20, 'Short biography should be at least 20 characters').max(240),
  bio: optStr(5000),
  specialties: z.array(z.string().trim().min(1).max(60)).min(1, 'Add at least one area of expertise').max(30),
  experienceYears: z.coerce.number().min(0).max(80),
  languages: z.array(z.string().trim().min(1).max(40)).min(1, 'Add at least one language').max(20),
  qualifications: z.string().trim().min(3, 'Please list your qualifications or certifications').max(3000),
  organization: optStr(120),
  socials: trainerSocials,
  teachingCategories: z.array(z.string().trim().min(1).max(60)).min(1, 'Choose at least one teaching category').max(20),
  topics: z.array(z.string().trim().min(1).max(80)).min(1, 'Add at least one topic').max(40),
  teachingFormat: z.enum(['online', 'offline', 'both']),
  sessionDuration: optStr(60),
  sessionType: z.enum(['individual', 'group', 'both']),
  introVideoUrl: url,
  methodology: z.string().trim().min(10, 'Please describe your teaching approach').max(3000),
  targetAudience: z.string().trim().min(3, 'Please describe your target audience').max(1000),
};

export const trainerRegisterSchema = passwordPair({
  name: z.string().trim().min(2, 'Please enter your full name').max(80),
  email,
  phone,
  ...trainerProfileFields,
  acceptTerms: mustAccept('You must accept the Terms and Conditions'),
  acceptTrainerAgreement: mustAccept('You must accept the Trainer Agreement'),
  acceptPrivacy: mustAccept('You must accept the Privacy Policy'),
});

/** Re-submission after NEEDS_INFORMATION / REJECTED: profile fields only. */
export const trainerApplicationUpdateSchema = z.object(trainerProfileFields).partial();

export const trainerApplicationReviewSchema = z.object({
  decision: z.enum(['start_review', 'approve', 'reject', 'request_information']),
  reason: optStr(1000),
});
export const trainerApplicationNoteSchema = z.object({ text: z.string().trim().min(1).max(2000) });

export const courseReviewSchema = z.object({
  decision: z.enum(['start_review', 'approve', 'reject', 'request_changes']),
  reason: optStr(1000),
});

// Login accepts an email address OR a mobile number (`email` kept for older clients).
export const loginSchema = z
  .object({
    identifier: z.string().trim().min(3).max(120).optional(),
    email: z.string().trim().max(120).optional(),
    password: z.string().min(1, 'Please enter your password'),
  })
  .refine((d) => d.identifier || d.email, { message: 'Please enter your email or mobile number', path: ['identifier'] })
  .transform((d) => ({ identifier: d.identifier || d.email, password: d.password }));

export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });
export const emailOnlySchema = z.object({ email });
export const resetPasswordSchema = passwordPair({ token: z.string().min(20).max(200) });

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
  targetAudience: optStr(1000),
  refundPolicy: optStr(2000),
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
  socials: z.object({ website: url, instagram: url, youtube: url, linkedin: url, facebook: url, other: url }).partial().optional(),
  languages: strList,
  qualifications: optStr(3000),
  organization: optStr(120),
  teachingCategories: strList,
  topics: strList,
  teachingFormat: z.enum(['online', 'offline', 'both']).optional(),
  sessionDuration: optStr(60),
  sessionType: z.enum(['individual', 'group', 'both']).optional(),
  introVideoUrl: url,
  methodology: optStr(3000),
  targetAudience: optStr(1000),
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
export const liveSessionReviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: optStr(500),
});

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
