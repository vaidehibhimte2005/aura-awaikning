import mongoose from 'mongoose';

const { Schema } = mongoose;

export const PAYMENT_STATUS = ['created', 'pending', 'paid', 'failed', 'refunded'];

const paymentSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    provider: { type: String, required: true },
    providerOrderId: { type: String, index: true }, // Razorpay order_id / Stripe session id
    transactionId: { type: String, sparse: true, unique: true }, // Razorpay payment_id / Stripe payment_intent
    status: { type: String, enum: PAYMENT_STATUS, default: 'created', index: true },
    method: String,
    paidAt: Date,
    refundedAt: Date,
    refundId: String,
    failureReason: String,
    verifiedVia: { type: String, enum: ['client_verify', 'webhook', 'admin'] },
    // Minimal provider payload for audit/debugging (never card data).
    raw: { type: Schema.Types.Mixed, select: false },
  },
  { timestamps: true },
);

paymentSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Payment', paymentSchema);
