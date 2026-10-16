import mongoose from 'mongoose';

const { Schema } = mongoose;

export const EARNING_STATUS = ['pending', 'approved', 'paid', 'failed'];

/** One payout line per booking (unique) — a session can never pay a trainer twice. */
const earningSchema = new Schema(
  {
    trainer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
    learner: { type: Schema.Types.ObjectId, ref: 'User' },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    reason: { type: String, enum: ['completed', 'learner_no_show', 'admin_resolved'], default: 'completed' },
    status: { type: String, enum: EARNING_STATUS, default: 'pending', index: true },
    sessionAt: { type: Date, required: true },
    approvedAt: Date,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    paidAt: Date,
    paidBy: { type: Schema.Types.ObjectId, ref: 'User' },
    // Recorded by an admin. This system does NOT move money; it only tracks the admin's confirmation.
    payoutReference: String,
    failureReason: String,
  },
  { timestamps: true },
);

earningSchema.index({ trainer: 1, status: 1, sessionAt: -1 });

export default mongoose.model('Earning', earningSchema);
