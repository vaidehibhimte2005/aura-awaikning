import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { Notification, User } from '../models/index.js';

/**
 * Channel adapters. `in_app` is always stored; others are attempted when the
 * user has opted in and the channel is configured. SMS / WhatsApp / push are
 * deliberately thin adapters — plug in Twilio, Gupshup, FCM, etc. here without
 * touching any caller.
 */
let transporter;
function mailer() {
  if (!env.smtp.host || !env.smtp.user) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.password },
    });
  }
  return transporter;
}

const channels = {
  async email(user, n) {
    const t = mailer();
    if (!t) return 'skipped';
    const link = n.link ? `${env.siteUrl}${n.link}` : env.siteUrl;
    await t.sendMail({
      from: env.smtp.from,
      to: user.email,
      subject: n.title,
      text: `${n.message}\n\n${link}`,
      html: `<div style="font-family:Georgia,serif;color:#033333"><h2 style="color:#033333">${n.title}</h2><p>${n.message}</p><p><a href="${link}" style="color:#9a7b4f">Open Aura Awakening</a></p></div>`,
    });
    return 'sent';
  },
  async sms() {
    return 'skipped'; // integrate SMS provider here
  },
  async whatsapp() {
    return 'skipped'; // integrate WhatsApp Business API here
  },
  async push() {
    return 'skipped'; // integrate FCM / APNs here (device tokens on a future Device model)
  },
};

/** Sends a one-off email (verification, password reset). Returns false when mail isn't configured. */
export async function sendEmail({ to, subject, text, html }) {
  const t = mailer();
  if (!t) return false;
  try {
    await t.sendMail({ from: env.smtp.from, to, subject, text, html: html || undefined });
    return true;
  } catch (err) {
    console.error('sendEmail failed', err.message);
    return false;
  }
}

/** Ids of active staff users with one of the given roles (e.g. managers + admins). */
export async function staffIds(roles = ['manager', 'admin']) {
  return User.find({ role: { $in: roles }, isActive: true }).distinct('_id');
}

/**
 * notify(userIds, { type, title, message, link, related, idempotencyKey }, { channels: ['email'] })
 *  - `related: { type, id }` links the notification to a record.
 *  - `idempotencyKey` guarantees one notification per recipient even if the
 *    triggering request is retried (backed by a unique index).
 * Never throws — notifications must not break the business flow that triggered them.
 */
export async function notify(userIds, payload, { channels: extra = [] } = {}) {
  let ids = [].concat(userIds).filter(Boolean).map(String);
  ids = [...new Set(ids)];
  if (!ids.length) return [];
  try {
    if (payload.idempotencyKey) {
      const seen = new Set(
        (await Notification.find({ user: { $in: ids }, idempotencyKey: payload.idempotencyKey }).select('user')).map((n) => n.user.toString()),
      );
      ids = ids.filter((id) => !seen.has(id));
      if (!ids.length) return [];
    }
    let docs;
    try {
      docs = await Notification.insertMany(
        ids.map((user) => ({ ...payload, user, deliveries: [{ channel: 'in_app', status: 'sent' }] })),
        { ordered: false },
      );
    } catch (err) {
      // A concurrent retry won the race on the unique idempotency index — keep what we inserted.
      if (err.code !== 11000 && !err.writeErrors) throw err;
      docs = err.insertedDocs || [];
    }
    if (extra.length) {
      const users = await User.find({ _id: { $in: ids } }).select('email notificationPrefs');
      const byId = new Map(users.map((u) => [u.id, u]));
      await Promise.all(
        docs.map(async (doc) => {
          const user = byId.get(doc.user.toString());
          if (!user) return;
          for (const ch of extra) {
            let status = 'skipped';
            let error;
            if (user.notificationPrefs?.[ch] !== false && channels[ch]) {
              try {
                // eslint-disable-next-line no-await-in-loop
                status = await channels[ch](user, payload);
              } catch (e) {
                status = 'failed';
                error = e.message;
              }
            }
            doc.deliveries.push({ channel: ch, status, error });
          }
          await doc.save();
        }),
      );
    }
    return docs;
  } catch (err) {
    console.error('notify() failed', err.message);
    return [];
  }
}
