import mongoose from 'mongoose';
import { videoFields, normaliseVideo } from '../utils/youtube.js';

const { Schema } = mongoose;

const resourceSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    kind: { type: String, enum: ['link', 'pdf', 'audio', 'image', 'document'], default: 'link' },
  },
  { _id: true },
);

const lessonSchema = new Schema(
  {
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    section: { type: String, trim: true, default: 'Lessons' }, // curriculum grouping
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: '' },
    notes: { type: String, default: '' }, // rich text / markdown notes for learners
    ...videoFields,
    order: { type: Number, default: 0 },
    isPreview: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true },
    resources: [resourceSchema], // downloadable files & links (attachments)
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

lessonSchema.index({ course: 1, order: 1 });

lessonSchema.pre('save', function beforeSave(next) {
  normaliseVideo(this);
  next();
});

export default mongoose.model('Lesson', lessonSchema);
