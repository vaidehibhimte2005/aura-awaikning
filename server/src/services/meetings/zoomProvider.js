import crypto from 'crypto';
import { env } from '../../config/env.js';

/**
 * Zoom (Server-to-Server OAuth app). Only selected when all four ZOOM_* env vars are set.
 * Required Zoom scopes: meeting:write:admin (create/delete meetings). For attendance, add an
 * Event Subscription to `meeting.participant_joined` / `meeting.participant_left` pointing at
 * POST {API_URL}/api/meetings/webhook/zoom and put its Secret Token in ZOOM_WEBHOOK_SECRET.
 *
 * NOTE: written against Zoom's public REST docs; it has not been exercised against a live
 * Zoom account in this repository. Test with your credentials before relying on it.
 */
const cfg = env.meetings.zoom;
let token = null;
let tokenExpiresAt = 0;

export const zoomConfigured = () => !!(cfg.accountId && cfg.clientId && cfg.clientSecret);

async function accessToken() {
  if (token && Date.now() < tokenExpiresAt - 30000) return token;
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(cfg.accountId)}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`Zoom auth failed: ${body.reason || body.error || res.status}`);
  token = body.access_token;
  tokenExpiresAt = Date.now() + (body.expires_in || 3500) * 1000;
  return token;
}

export const zoomProvider = {
  name: 'zoom',
  isDemo: false,

  async createMeeting({ booking, trainer }) {
    const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: `Aura Awakening training with ${trainer?.name || 'your trainer'}`,
        type: 2,
        start_time: new Date(booking.startAt).toISOString(),
        duration: booking.durationMin,
        timezone: 'UTC',
        settings: { join_before_host: false, waiting_room: true, approval_type: 2 },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.join_url) throw new Error(`Zoom could not create the meeting: ${body.message || res.status}`);
    return {
      provider: 'zoom',
      isDemo: false,
      joinUrl: body.join_url,
      hostUrl: body.start_url,
      meetingId: String(body.id),
      passcode: body.password,
    };
  },

  async cancelMeeting(meetingId) {
    const res = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await accessToken()}` },
    });
    return res.ok || res.status === 404;
  },

  /** Zoom signs `v0:{timestamp}:{rawBody}` with the webhook secret token. */
  verifyWebhook(rawBody, headers) {
    if (!cfg.webhookSecret) return false;
    const ts = headers['x-zm-request-timestamp'];
    const sig = headers['x-zm-signature'];
    if (!ts || !sig) return false;
    const expected = `v0=${crypto.createHmac('sha256', cfg.webhookSecret).update(`v0:${ts}:${rawBody}`).digest('hex')}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(String(sig));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  },

  urlValidation(plainToken) {
    return { plainToken, encryptedToken: crypto.createHmac('sha256', cfg.webhookSecret).update(plainToken).digest('hex') };
  },
};
