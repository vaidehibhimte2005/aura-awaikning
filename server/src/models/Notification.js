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
  'trainer_application',
  'course_review',
  'refund',
  'account',
  'system',
  'booking',
  'session',
  'package',
  'payout',
  'attendance',
  'trainer_account',
  'registration',
];

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, default: 'system' },
    title: { type: String, required: true },
    message: { type: String, default: '' },
    link: { type: String, default: '' },
    readAt: Date,
    // What the notification is about, for deep links and de-duplication.
    related: {
      type: { type: String, enum: ['trainer_application', 'course', 'enrollment', 'order', 'payment', 'live_session', 'user', 'booking', 'subscription', 'earning', 'slot'] },
      id: Schema.Types.ObjectId,
    },
    // Same key + same recipient = one notification, even if the triggering request is retried.
    idempotencyKey: { type: String },
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
notificationSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });

export default mongoose.model('Notification', notificationSchema);
