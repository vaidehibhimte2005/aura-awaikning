import mongoose from 'mongoose';

const { Schema } = mongoose;

/** A bookable window a trainer has published. Learners can only book `available` slots. */
const slotSchema = new Schema(
  {
    trainer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    durationMin: { type: Number, required: true },
    status: { type: String, enum: ['available', 'booked', 'cancelled'], default: 'available' },
    // false once cancelled — lets the unique index below ignore dead slots.
    active: { type: Boolean, default: true },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking' },
  },
  { timestamps: true },
);

// Database-level guard: a trainer can never have two live slots starting at the same instant.
slotSchema.index({ trainer: 1, start: 1 }, { unique: true, partialFilterExpression: { active: true } });
slotSchema.index({ status: 1, start: 1 });
slotSchema.index({ trainer: 1, end: 1 });

export default mongoose.model('Slot', slotSchema);
