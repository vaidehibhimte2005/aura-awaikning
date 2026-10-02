import mongoose from 'mongoose';

const { Schema } = mongoose;

const lessonProgressSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    lesson: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true },
    completed: { type: Boolean, default: false },
    completedAt: Date,
    lastPositionSeconds: { type: Number, default: 0 },
  },
  { timestamps: true },
);

lessonProgressSchema.index({ user: 1, lesson: 1 }, { unique: true });
lessonProgressSchema.index({ user: 1, course: 1 });

export default mongoose.model('LessonProgress', lessonProgressSchema);
