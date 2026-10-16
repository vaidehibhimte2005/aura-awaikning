import mongoose from 'mongoose';

const { Schema } = mongoose;

export const BOOKING_STATUS = [
  'confirmed',
  'completed',
  'cancelled_by_learner',
  'cancelled_by_trainer',
  'cancelled_by_admin',
  'learner_no_show',
  'trainer_no_show',
  'technical_failure', // admin-confirmed: session could not take place properly — not counted, not paid
  'needs_review', // both joined but the policy was not met (e.g. technical failure) — admin decides
];

const bookingSchema = new Schema(
  {
    learner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    trainer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    slot: { type: Schema.Types.ObjectId, ref: 'Slot', required: true },
    subscription: { type: Schema.Types.ObjectId, ref: 'Subscription', required: true, index: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    durationMin: { type: Number, required: true },
    dayKey: { type: String, required: true }, // YYYY-MM-DD in the configured timezone
    status: { type: String, enum: BOOKING_STATUS, default: 'confirmed', index: true },
    notes: { type: String, maxlength: 500, default: '' },
    meeting: {
      provider: { type: String, enum: ['demo', 'zoom'], default: 'demo' },
      isDemo: { type: Boolean, default: true },
      joinUrl: String,
      hostUrl: String,
      meetingId: String,
      passcode: String,
    },
    // Summary of attendance, derived from AttendanceEvent rows.
    attendance: {
      trainerMinutes: Number,
      learnerMinutes: Number,
      overlapMinutes: Number,
      usedDemoEvents: Boolean,
    },
    outcome: {
      reason: String,
      countedAsTrainingDay: { type: Boolean, default: false },
      sameDayAsPrevious: { type: Boolean, default: false },
      evaluatedAt: Date,
      resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      resolutionNote: String,
    },
    // Idempotency flags for the settle step (safe to re-run after a crash).
    reservationReleased: { type: Boolean, default: false },
    effectsApplied: { type: Boolean, default: false },
    cancelledAt: Date,
    cancelReason: String,
    rescheduledFrom: [{ slot: Schema.Types.ObjectId, startAt: Date, at: Date, _id: false }],
  },
  { timestamps: true },
);

// One live booking per slot, enforced by the database (not just by application code).
bookingSchema.index({ slot: 1 }, { unique: true, partialFilterExpression: { status: 'confirmed' } });
bookingSchema.index({ learner: 1, startAt: -1 });
bookingSchema.index({ trainer: 1, startAt: -1 });
bookingSchema.index({ status: 1, endAt: 1 });
bookingSchema.index({ learner: 1, dayKey: 1, status: 1 });

export default mongoose.model('Booking', bookingSchema);
