import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Singleton (key: 'default') holding every admin-editable business rule.
 * Nothing about pricing, discounts, payouts or attendance policy is hardcoded —
 * the values below are only first-run defaults.
 */
const trainingConfigSchema = new Schema(
  {
    key: { type: String, default: 'default', unique: true },
    currency: { type: String, default: 'INR', uppercase: true },
    timezone: { type: String, default: 'Asia/Kolkata' }, // defines what "a training day" means
    dailyRate: { type: Number, default: 1000, min: 0 }, // base price of ONE training day
    trainerPayoutPerSession: { type: Number, default: 500, min: 0 }, // default; per-trainer override on Trainer
    policy: {
      minAttendancePct: { type: Number, default: 60, min: 1, max: 100 }, // each side must be present this % of the session
      minOverlapPct: { type: Number, default: 50, min: 1, max: 100 }, // both present together this % of the session
      joinWindowMinutes: { type: Number, default: 10, min: 0 }, // may join this long before start
      finalizeGraceMinutes: { type: Number, default: 15, min: 0 }, // evaluate this long after the end
      acceptDemoAttendance: { type: Boolean, default: process.env.NODE_ENV !== 'production' },
      payTrainerOnLearnerNoShow: { type: Boolean, default: false },
    },
    booking: {
      cancelCutoffHours: { type: Number, default: 4, min: 0 },
      maxSessionsPerDay: { type: Number, default: 1, min: 1 },
      minLeadMinutes: { type: Number, default: 30, min: 0 },
      maxAdvanceDays: { type: Number, default: 60, min: 1 },
    },
    reminders: {
      expiryDays: { type: [Number], default: [3, 1] },
      sessionMinutes: { type: Number, default: 60, min: 5 },
    },
    renewal: {
      windowDays: { type: Number, default: 3, min: 0 }, // may renew when expiring within this many days
      remainingDays: { type: Number, default: 1, min: 0 }, // …or when this few training days are left
    },
  },
  { timestamps: true },
);

export default mongoose.model('TrainingConfig', trainingConfigSchema);
