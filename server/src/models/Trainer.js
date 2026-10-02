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
    },
    isPublished: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

trainerSchema.index({ isPublished: 1, order: 1 });

export default mongoose.model('Trainer', trainerSchema);
