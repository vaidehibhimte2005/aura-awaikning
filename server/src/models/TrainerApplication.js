import mongoose from 'mongoose';

const { Schema } = mongoose;

export const APPLICATION_STATUS = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_INFORMATION'];

const historySchema = new Schema(
  {
    from: String,
    to: { type: String, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const noteSchema = new Schema(
  {
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: 2000 },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

/**
 * One trainer's application to teach. The submitted profile lives on the
 * Trainer document; this record owns the review workflow and its audit trail.
 * `internalNotes` is staff-only and is excluded from queries by default.
 */
const trainerApplicationSchema = new Schema(
  {
    applicationId: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    trainer: { type: Schema.Types.ObjectId, ref: 'Trainer', required: true },
    status: { type: String, enum: APPLICATION_STATUS, default: 'PENDING', index: true },
    submittedAt: { type: Date, default: Date.now, index: true },
    resubmittedAt: Date,
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    decisionReason: { type: String, default: '' },
    internalNotes: { type: [noteSchema], select: false, default: [] },
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true },
);

trainerApplicationSchema.index({ status: 1, submittedAt: -1 });

export default mongoose.model('TrainerApplication', trainerApplicationSchema);
