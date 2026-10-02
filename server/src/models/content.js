/**
 * Website content models managed by Admin / Content & Live Manager.
 * Kept together because each one is small and follows the same pattern.
 */
import mongoose from 'mongoose';

const { Schema } = mongoose;

const articleSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, required: true, unique: true },
    excerpt: { type: String, maxlength: 400, default: '' },
    body: { type: String, default: '' }, // markdown
    coverImage: { type: String, default: '' },
    category: { type: String, trim: true, default: 'Awareness' },
    tags: [{ type: String, trim: true, lowercase: true }],
    author: { type: Schema.Types.ObjectId, ref: 'User' },
    authorName: { type: String, default: '' },
    readMinutes: { type: Number, default: 4 },
    status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    publishedAt: Date,
    seo: { metaTitle: String, metaDescription: String },
  },
  { timestamps: true },
);
articleSchema.index({ title: 'text', excerpt: 'text', tags: 'text' });
articleSchema.index({ status: 1, publishedAt: -1 });
articleSchema.pre('save', function setPublished(next) {
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) this.publishedAt = new Date();
  next();
});

const faqSchema = new Schema(
  {
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true },
    category: { type: String, trim: true, default: 'General' },
    order: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true },
);
faqSchema.index({ isPublished: 1, category: 1, order: 1 });

const testimonialSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    role: { type: String, trim: true, default: '' }, // e.g. "Learner, Mumbai"
    quote: { type: String, required: true, maxlength: 600 },
    avatar: { type: String, default: '' },
    rating: { type: Number, min: 1, max: 5, default: 5 },
    course: { type: Schema.Types.ObjectId, ref: 'Course' },
    isPublished: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const announcementSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true },
    link: { type: String, default: '' },
    linkLabel: { type: String, default: '' },
    audience: { type: String, enum: ['all', 'learners', 'trainers'], default: 'all' },
    showAsBanner: { type: Boolean, default: false },
    startsAt: Date,
    endsAt: Date,
    isActive: { type: Boolean, default: true },
    notifyUsers: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const contactMessageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    subject: { type: String, default: '' },
    message: { type: String, required: true, maxlength: 4000 },
    status: { type: String, enum: ['new', 'read', 'replied', 'archived'], default: 'new', index: true },
  },
  { timestamps: true },
);

/** Key/value settings: `homepage`, `general`, `social`, … (value is a JSON object). */
const siteSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: Schema.Types.Mixed, default: {} },
    isPublic: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, minimize: false },
);

export const Article = mongoose.model('Article', articleSchema);
export const FAQ = mongoose.model('FAQ', faqSchema);
export const Testimonial = mongoose.model('Testimonial', testimonialSchema);
export const Announcement = mongoose.model('Announcement', announcementSchema);
export const ContactMessage = mongoose.model('ContactMessage', contactMessageSchema);
export const SiteSetting = mongoose.model('SiteSetting', siteSettingSchema);
