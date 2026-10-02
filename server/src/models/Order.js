import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * An Order is the learner's intent to buy a course (price locked at checkout).
 * A Payment is a provider transaction attempt for that order. An order may
 * have several payment attempts (e.g. a failed card, then a successful UPI).
 */
export const ORDER_STATUS = ['created', 'pending', 'paid', 'failed', 'refunded', 'cancelled'];

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    amount: { type: Number, required: true, min: 0 }, // major unit
    currency: { type: String, required: true, uppercase: true },
    provider: { type: String, required: true },
    providerOrderId: { type: String, index: true },
    status: { type: String, enum: ORDER_STATUS, default: 'created', index: true },
    paidAt: Date,
    failureReason: String,
  },
  { timestamps: true },
);

orderSchema.index({ user: 1, course: 1, status: 1 });
orderSchema.index({ createdAt: -1 });

export default mongoose.model('Order', orderSchema);
