import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A learner's paid package. Created only after server-verified payment (one per
 * order — unique index — so a retried webhook can never double-activate).
 *
 * Calendar expiry (`expiresAt`) and consumption (`daysUsed`) are independent:
 *  - daysUsed only increases when a session is verified as completed.
 *  - reservedDays counts confirmed-but-not-yet-settled bookings so a learner
 *    can never hold more bookings than training days they have left.
 */
const subscriptionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    package: { type: Schema.Types.ObjectId, ref: 'Package' },
    packageName: { type: String, required: true },
    planKind: { type: String, default: 'custom' },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    purchaseMode: { type: String, enum: ['new', 'renew', 'upgrade'], default: 'new' },
    status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active', index: true },
    trainingDays: { type: Number, required: true, min: 1 },
    validityDays: { type: Number, required: true },
    daysUsed: { type: Number, default: 0, min: 0 },
    reservedDays: { type: Number, default: 0, min: 0 },
    sessionsCompleted: { type: Number, default: 0, min: 0 },
    startsAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: true },
    pricing: {
      dailyRate: Number,
      baseAmount: Number,
      discount: Number,
      amount: Number,
      currency: String,
    },
    cancelledAt: Date,
    cancelReason: String,
  },
  { timestamps: true },
);

subscriptionSchema.index({ user: 1, status: 1, expiresAt: 1 });

subscriptionSchema.virtual('remainingDays').get(function remaining() {
  return Math.max(0, this.trainingDays - this.daysUsed);
});
subscriptionSchema.virtual('availableToBook').get(function avail() {
  return Math.max(0, this.trainingDays - this.daysUsed - this.reservedDays);
});
subscriptionSchema.virtual('phase').get(function phase() {
  if (!this.startsAt || !this.expiresAt) return undefined; // partially-selected document
  if (this.status === 'cancelled') return 'cancelled';
  if (this.status === 'expired') return 'expired';
  const now = Date.now();
  if (this.expiresAt.getTime() < now) return 'expired';
  if (this.startsAt.getTime() > now) return 'upcoming';
  if (this.daysUsed >= this.trainingDays) return 'exhausted';
  return 'active';
});
subscriptionSchema.set('toJSON', { virtuals: true });
subscriptionSchema.set('toObject', { virtuals: true });

export default mongoose.model('Subscription', subscriptionSchema);
