import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Ledger of consumed training days. Two unique indexes make double-deduction
 * impossible: one record per booking, and one per (subscription, calendar day).
 */
const usageRecordSchema = new Schema(
  {
    subscription: { type: Schema.Types.ObjectId, ref: 'Subscription', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    dayKey: { type: String, required: true },
  },
  { timestamps: true },
);

usageRecordSchema.index({ booking: 1 }, { unique: true });
usageRecordSchema.index({ subscription: 1, dayKey: 1 }, { unique: true });

export default mongoose.model('UsageRecord', usageRecordSchema);
