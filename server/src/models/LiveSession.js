import mongoose from 'mongoose';
import { normaliseVideo } from '../utils/youtube.js';

const { Schema } = mongoose;

/**
 * Live sessions AND events share one collection (`kind`), because both are
 * scheduled, trainer-led happenings with a time window. Events may be in person.
 */
const liveSessionSchema = new Schema(
  {
    kind: { type: String, enum: ['session', 'event'], default: 'session', index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    trainer: { type: Schema.Types.ObjectId, ref: 'Trainer', index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course' }, // optional: session tied to a course
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    // Live stream
    youtubeUrl: { type: String, trim: true, default: '' },
    youtubeId: { type: String, trim: true, default: '' }, // YouTube Live ID
    recordingUrl: { type: String, trim: true, default: '' },
    recordingId: { type: String, trim: true, default: '' },
    thumbnail: { type: String, default: '' },
    // Event extras
    mode: { type: String, enum: ['online', 'in_person', 'hybrid'], default: 'online' },
    venue: { type: String, default: '' },
    // Status — `liveStatus` lets a trainer force "live" or "ended";
    // `auto` derives the state from the time window.
    liveStatus: { type: String, enum: ['auto', 'live', 'ended'], default: 'auto' },
    isPublished: { type: Boolean, default: false, index: true },
    // Trainer-created sessions start as `pending` and only reach learners
    // (isPublished = true) once a manager/admin approves them.
    approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved', index: true },
    rejectionReason: { type: String, default: '' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    requiresRegistration: { type: Boolean, default: false },
    accessLevel: { type: String, enum: ['public', 'registered', 'enrolled'], default: 'public' },
    capacity: { type: Number, min: 0 },
    registrations: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    reminderSentAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

liveSessionSchema.virtual('state').get(function state() {
  const now = Date.now();
  if (this.liveStatus === 'ended') return 'completed';
  if (this.liveStatus === 'live') return 'live';
  if (this.endAt && now > this.endAt.getTime()) return 'completed';
  if (this.startAt && now >= this.startAt.getTime()) return 'live';
  return 'upcoming';
});

liveSessionSchema.virtual('registrationCount').get(function count() {
  return this.registrations?.length || 0;
});

liveSessionSchema.index({ isPublished: 1, kind: 1, startAt: 1 });

liveSessionSchema.pre('save', function beforeSave(next) {
  normaliseVideo(this);
  const rec = { youtubeUrl: this.recordingUrl, youtubeId: this.recordingId };
  normaliseVideo(rec);
  this.recordingUrl = rec.youtubeUrl;
  this.recordingId = rec.youtubeId;
  return next();
});

liveSessionSchema.pre('validate', function checkWindow(next) {
  if (this.startAt && this.endAt && this.endAt <= this.startAt) {
    this.invalidate('endAt', 'End time must be after start time');
  }
  next();
});

export default mongoose.model('LiveSession', liveSessionSchema);
