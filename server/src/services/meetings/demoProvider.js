import { env } from '../../config/env.js';

/**
 * Demo provider: NO real video meeting is created. The "link" opens the in-app demo
 * room (/session/:id) where participants can record DEMO attendance. Everything it
 * produces is flagged `isDemo` so the UI and the attendance policy can treat it as such.
 */
export const demoProvider = {
  name: 'demo',
  isDemo: true,

  async createMeeting({ booking }) {
    return {
      provider: 'demo',
      isDemo: true,
      joinUrl: `${env.siteUrl}/session/${booking.id}`,
      hostUrl: `${env.siteUrl}/session/${booking.id}`,
      meetingId: `demo-${booking.id}`,
    };
  },

  async cancelMeeting() {
    return true;
  },
};
