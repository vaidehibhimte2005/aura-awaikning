import mongoose from 'mongoose';

const { Schema } = mongoose;

const certificateSchema = new Schema(
  {
    certificateNumber: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    enrollment: { type: Schema.Types.ObjectId, ref: 'Enrollment' },
    // Snapshot values so the certificate stays correct if names change later.
    learnerName: { type: String, required: true },
    courseTitle: { type: String, required: true },
    trainerName: { type: String, default: '' },
    completedAt: { type: Date, required: true },
    fileUrl: { type: String, default: '' }, // future: generated PDF in object storage
    status: { type: String, enum: ['issued', 'revoked'], default: 'issued' },
  },
  { timestamps: true },
);

certificateSchema.index({ user: 1, course: 1 }, { unique: true });

export default mongoose.model('Certificate', certificateSchema);
