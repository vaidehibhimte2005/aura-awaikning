import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES } from '../config/permissions.js';

const { Schema } = mongoose;

/**
 * One account per person, shared by web, mobile web and any future native app.
 * `authProviders` makes the account ready for OTP / Google / Apple sign-in
 * without restructuring: a new provider is just another entry.
 */
const authProviderSchema = new Schema(
  {
    provider: { type: String, enum: ['password', 'google', 'apple', 'phone_otp'], required: true },
    providerId: { type: String }, // e.g. Google `sub`, Apple user id, phone number
    linkedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const refreshTokenSchema = new Schema(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    userAgent: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Future mobile-OTP login. Empty strings are stored as undefined so the sparse unique index works.
    phone: { type: String, trim: true, sparse: true, unique: true, set: (v) => v || undefined },
    password: { type: String, select: false, minlength: 8 },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.LEARNER, index: true },
    extraPermissions: [{ type: String }],
    avatar: { type: String, default: '' },
    bio: { type: String, maxlength: 600, default: '' },
    isActive: { type: Boolean, default: true },
    emailVerified: { type: Boolean, default: false },
    authProviders: { type: [authProviderSchema], default: [{ provider: 'password' }] },
    refreshTokens: { type: [refreshTokenSchema], select: false, default: [] },
    lastLoginAt: Date,
    notificationPrefs: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      whatsapp: { type: Boolean, default: false },
      push: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

userSchema.index({ name: 'text', email: 'text' });

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject({ virtuals: true });
  delete obj.password;
  delete obj.refreshTokens;
  delete obj.__v;
  return obj;
};

export default mongoose.model('User', userSchema);
