import mongoose from 'mongoose';

const { Schema } = mongoose;

const enrollmentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    source: { type: String, enum: ['free', 'purchase', 'admin'], default: 'free' },
    status: { type: String, enum: ['active', 'completed', 'revoked'], default: 'active', index: true },
    progressPercent: { type: Number, min: 0, max: 100, default: 0 },
    completedLessons: { type: Number, default: 0 },
    lastLesson: { type: Schema.Types.ObjectId, ref: 'Lesson' },
    lastAccessedAt: Date,
    completedAt: Date,
  },
  { timestamps: true },
);

// One enrollment per user per course — enforced by the database.
enrollmentSchema.index({ user: 1, course: 1 }, { unique: true });
enrollmentSchema.index({ user: 1, lastAccessedAt: -1 });

export default mongoose.model('Enrollment', enrollmentSchema);
