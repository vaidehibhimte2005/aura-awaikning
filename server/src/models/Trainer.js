import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Public trainer profile, linked 1:1 to a User with role `trainer`. */
const trainerSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    displayName: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    title: { type: String, trim: true, default: '' }, // e.g. "Meditation Guide"
    bio: { type: String, default: '' },
    shortBio: { type: String, maxlength: 240, default: '' },
    photo: { type: String, default: '' },
    specialties: [{ type: String, trim: true }],
    experienceYears: { type: Number, min: 0, default: 0 },
    socials: {
      website: String,
      instagram: String,
      youtube: String,
      linkedin: String,
      facebook: String,
      other: String,
    },
    // Application details (contact data stays on User and is never exposed publicly).
    languages: [{ type: String, trim: true }],
    qualifications: { type: String, default: '' },
    organization: { type: String, default: '' },
    location: { country: String, state: String, city: String },
    gender: { type: String, default: '', select: false },
    dateOfBirth: { type: Date, select: false },
    teachingCategories: [{ type: String, trim: true }],
    topics: [{ type: String, trim: true }],
    teachingFormat: { type: String, enum: ['online', 'offline', 'both'], default: 'online' },
    sessionDuration: { type: String, default: '' },
    sessionType: { type: String, enum: ['individual', 'group', 'both'], default: 'both' },
    introVideoUrl: { type: String, default: '' },
    methodology: { type: String, default: '' },
    targetAudience: { type: String, default: '' },
    // Admin-set payout for each eligible completed session. null → use the global default.
    payoutPerSession: { type: Number, min: 0, default: null },
    isPublished: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

trainerSchema.index({ isPublished: 1, order: 1 });

export default mongoose.model('Trainer', trainerSchema);
