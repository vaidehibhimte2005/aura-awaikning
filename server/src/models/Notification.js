import mongoose from 'mongoose';

const { Schema } = mongoose;

export const NOTIFICATION_TYPES = [
  'course_new',
  'enrollment',
  'payment_success',
  'payment_failed',
  'live_reminder',
  'lesson_new',
  'announcement',
  'certificate',
  'system',
];

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, default: 'system' },
    title: { type: String, required: true },
    message: { type: String, default: '' },
    link: { type: String, default: '' },
    readAt: Date,
    // Delivery log per channel — lets email/SMS/WhatsApp/push workers report back.
    deliveries: [
      {
        channel: { type: String, enum: ['in_app', 'email', 'sms', 'whatsapp', 'push'] },
        status: { type: String, enum: ['sent', 'skipped', 'failed'] },
        at: { type: Date, default: Date.now },
        error: String,
        _id: false,
      },
    ],
  },
  { timestamps: true },
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1 });

export default mongoose.model('Notification', notificationSchema);
