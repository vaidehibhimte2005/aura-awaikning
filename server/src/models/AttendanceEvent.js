import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Raw join/leave facts. `source: 'provider'` comes from the meeting provider's
 * webhooks (verified); `source: 'demo'` comes from the built-in demo room and is
 * stored separately so it can never be mistaken for verified attendance.
 */
const attendanceEventSchema = new Schema(
  {
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['learner', 'trainer'], required: true },
    type: { type: String, enum: ['join', 'leave'], required: true },
    at: { type: Date, required: true },
    source: { type: String, enum: ['provider', 'demo'], required: true },
    externalId: { type: String }, // provider event id → duplicate webhooks are ignored
  },
  { timestamps: true },
);

attendanceEventSchema.index({ externalId: 1 }, { unique: true, partialFilterExpression: { externalId: { $type: 'string' } } });
attendanceEventSchema.index({ booking: 1, role: 1, at: 1 });

export default mongoose.model('AttendanceEvent', attendanceEventSchema);
