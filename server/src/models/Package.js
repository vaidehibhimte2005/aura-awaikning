import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A purchasable plan. The price is NEVER stored: it is derived from the admin's
 * current base daily rate × trainingDays − discount (see pricingService), so
 * changing the rate or a discount immediately reprices every plan.
 */
const packageSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 40 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    kind: { type: String, enum: ['daily', 'weekly', 'monthly', 'custom'], default: 'custom' },
    description: { type: String, default: '', maxlength: 400 },
    features: [{ type: String, trim: true, maxlength: 120 }],
    trainingDays: { type: Number, required: true, min: 1, max: 366 }, // training days included
    validityDays: { type: Number, required: true, min: 1, max: 730 }, // calendar window
    discountType: { type: String, enum: ['percent', 'amount'], default: 'percent' },
    discountValue: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

packageSchema.index({ isActive: 1, order: 1 });

export default mongoose.model('Package', packageSchema);
