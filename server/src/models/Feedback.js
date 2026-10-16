import mongoose from 'mongoose';

const { Schema } = mongoose;

/** A learner's rating of one completed session. One per booking (unique), so it can't be duplicated. */
const feedbackSchema = new Schema(
  {
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
    learner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    trainer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { timestamps: true },
);

feedbackSchema.index({ trainer: 1, createdAt: -1 });

export default mongoose.model('Feedback', feedbackSchema);
