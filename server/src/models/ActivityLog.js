import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Append-only audit trail of important business actions. Never store secrets here. */
const activityLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorRole: String,
    action: { type: String, required: true, index: true }, // e.g. trainer_application.approved
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId },
    entityLabel: String,
    from: String,
    to: String,
    reason: String,
    meta: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

export default mongoose.model('ActivityLog', activityLogSchema);
