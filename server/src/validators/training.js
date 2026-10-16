import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const num = (min, max) => z.coerce.number().min(min).max(max);
const email = z.string().trim().toLowerCase().email('Please enter a valid email');
const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-().]/g, ''))
  .refine((v) => /^\+?\d{7,15}$/.test(v), 'Please enter a valid mobile number');
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the 24-hour format HH:MM');

export const packageSchema = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, 'Code: lowercase letters, numbers and dashes'),
  name: z.string().trim().min(2).max(80),
  kind: z.enum(['daily', 'weekly', 'monthly', 'custom']).default('custom'),
  description: z.string().trim().max(400).default(''),
  features: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  trainingDays: z.coerce.number().int().min(1).max(366),
  validityDays: z.coerce.number().int().min(1).max(730),
  discountType: z.enum(['percent', 'amount']).default('percent'),
  discountValue: num(0, 1000000).default(0),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  order: z.coerce.number().int().default(0),
}).superRefine((d, ctx) => {
  if (d.discountType === 'percent' && d.discountValue > 100) {
    ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'A percentage discount cannot exceed 100' });
  }
  if (d.validityDays < d.trainingDays) {
    ctx.addIssue({ code: 'custom', path: ['validityDays'], message: 'Validity (calendar days) cannot be shorter than the number of training days' });
  }
});
export const packageUpdateSchema = packageSchema.innerType().partial().omit({ code: true });

export const configSchema = z
  .object({
    currency: z.string().trim().length(3).toUpperCase(),
    timezone: z.string().trim().min(3).max(60).refine((tz) => {
      try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
    }, 'Unknown timezone'),
    dailyRate: num(0, 10000000),
    trainerPayoutPerSession: num(0, 10000000),
    policy: z.object({
      minAttendancePct: num(1, 100),
      minOverlapPct: num(1, 100),
      joinWindowMinutes: num(0, 120),
      finalizeGraceMinutes: num(0, 240),
      acceptDemoAttendance: z.boolean(),
      payTrainerOnLearnerNoShow: z.boolean(),
    }).partial(),
    booking: z.object({
      cancelCutoffHours: num(0, 168),
      maxSessionsPerDay: z.coerce.number().int().min(1).max(10),
      minLeadMinutes: num(0, 10080),
      maxAdvanceDays: z.coerce.number().int().min(1).max(365),
    }).partial(),
    reminders: z.object({
      expiryDays: z.array(z.coerce.number().int().min(1).max(60)).min(1).max(5),
      sessionMinutes: num(5, 1440),
    }).partial(),
    renewal: z.object({ windowDays: num(0, 90), remainingDays: num(0, 30) }).partial(),
  })
  .partial();

export const checkoutPackageSchema = z.object({ packageId: objectId, mode: z.enum(['renew', 'upgrade']).optional() });

export const publishSlotsSchema = z.object({
  dates: z.array(date).min(1, 'Choose at least one date').max(31),
  startTime: time,
  endTime: time,
  durationMin: z.coerce.number().int().min(15).max(240),
  gapMin: z.coerce.number().int().min(0).max(120).default(0),
});

export const bookSchema = z.object({ slotId: objectId, notes: z.string().trim().max(500).optional() });
export const cancelSchema = z.object({ reason: z.string().trim().max(300).optional() });
export const rescheduleSchema = z.object({ slotId: objectId });
export const attendanceSchema = z.object({ type: z.enum(['join', 'leave']) });
export const resolveSchema = z.object({
  action: z.enum(['complete', 'technical_failure', 'trainer_no_show', 'learner_no_show']),
  note: z.string().trim().max(300).optional(),
});

export const adminTrainerCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email,
  phone,
  password: password.optional().or(z.literal('')).transform((v) => v || undefined),
  title: z.string().trim().max(120).default(''),
  shortBio: z.string().trim().max(240).default(''),
  bio: z.string().trim().max(3000).default(''),
  specialties: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  languages: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  experienceYears: num(0, 80).default(0),
  payoutPerSession: z.coerce.number().min(0).max(10000000).nullable().optional(),
});
export const adminTrainerUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone,
  title: z.string().trim().max(120),
  shortBio: z.string().trim().max(240),
  bio: z.string().trim().max(3000),
  specialties: z.array(z.string().trim().min(1).max(60)).max(20),
  languages: z.array(z.string().trim().min(1).max(40)).max(10),
  experienceYears: num(0, 80),
  payoutPerSession: z.coerce.number().min(0).max(10000000).nullable(),
  isActive: z.boolean(),
  newPassword: password,
}).partial();

export const trainerSelfUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  title: z.string().trim().max(120),
  shortBio: z.string().trim().max(240),
  bio: z.string().trim().max(3000),
  specialties: z.array(z.string().trim().min(1).max(60)).max(20),
  languages: z.array(z.string().trim().min(1).max(40)).max(10),
  experienceYears: num(0, 80),
  photo: z.string().trim().max(1000),
  phone,
}).partial();

export const payoutIdsSchema = z.object({ ids: z.array(objectId).min(1).max(500), reference: z.string().trim().max(120).optional(), reason: z.string().trim().max(200).optional() });
export const adminLearnerUpdateSchema = z.object({ isActive: z.boolean() });
export const cancelSubscriptionSchema = z.object({ reason: z.string().trim().max(200).optional() });

export const feedbackSchema = z.object({ bookingId: objectId, rating: z.coerce.number().int().min(1, 'Choose a rating').max(5), comment: z.string().trim().max(1000).optional() });
