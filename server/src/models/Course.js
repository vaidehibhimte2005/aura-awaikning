import mongoose from 'mongoose';
import { videoFields, normaliseVideo } from '../utils/youtube.js';

const { Schema } = mongoose;

const previewVideoSchema = new Schema({ ...videoFields }, { _id: false });

const courseSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    slug: { type: String, required: true, unique: true },
    shortDescription: { type: String, maxlength: 300, default: '' },
    description: { type: String, default: '' },
    coverImage: { type: String, default: '' },
    category: { type: Schema.Types.ObjectId, ref: 'Category', index: true },
    level: { type: String, enum: ['beginner', 'intermediate', 'advanced', 'all'], default: 'all', index: true },
    language: { type: String, default: 'English' },
    trainers: [{ type: Schema.Types.ObjectId, ref: 'Trainer', index: true }],
    price: { type: Number, min: 0, default: 0 }, // major unit (₹ / $); 0 = free
    compareAtPrice: { type: Number, min: 0 },
    currency: { type: String, default: 'INR', uppercase: true },
    previewVideo: { type: previewVideoSchema, default: () => ({}) },
    requirements: [{ type: String, trim: true }],
    outcomes: [{ type: String, trim: true }], // what the learner will gain
    tags: [{ type: String, trim: true, lowercase: true }],
    // Denormalised counters, recalculated by lessonService on lesson changes.
    lessonCount: { type: Number, default: 0 },
    durationMinutes: { type: Number, default: 0 },
    enrollmentCount: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
    isFeatured: { type: Boolean, default: false, index: true },
    certificateEnabled: { type: Boolean, default: true },
    seo: {
      metaTitle: String,
      metaDescription: String,
    },
    publishedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

courseSchema.virtual('isFree').get(function isFree() {
  return !this.price;
});

courseSchema.index({ title: 'text', shortDescription: 'text', tags: 'text' });
courseSchema.index({ status: 1, isFeatured: -1, createdAt: -1 });
courseSchema.index({ status: 1, price: 1 });

courseSchema.pre('save', function beforeSave(next) {
  if (this.previewVideo) normaliseVideo(this.previewVideo);
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

export default mongoose.model('Course', courseSchema);
