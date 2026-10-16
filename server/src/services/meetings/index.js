import { env } from '../../config/env.js';
import { demoProvider } from './demoProvider.js';
import { zoomConfigured, zoomProvider } from './zoomProvider.js';

/** Adding Google Meet / Teams = a module with createMeeting + cancelMeeting, registered here. */
export function activeMeetingProvider() {
  if (env.meetings.requested === 'zoom' && zoomConfigured()) return zoomProvider;
  return demoProvider;
}

export function meetingProviderInfo() {
  const p = activeMeetingProvider();
  return {
    provider: p.name,
    isDemo: p.isDemo,
    requested: env.meetings.requested,
    note: p.isDemo
      ? env.meetings.requested === 'zoom'
        ? 'Zoom was requested but credentials are missing — using the DEMO room.'
        : 'Demo mode: no real meeting is created.'
      : 'Meetings are created through the Zoom API.',
  };
}

/** Creates the meeting for a booking. On provider failure falls back to the labelled demo room. */
export async function createMeetingFor(booking, trainer) {
  const provider = activeMeetingProvider();
  try {
    return await provider.createMeeting({ booking, trainer });
  } catch (err) {
    console.error('meeting provider failed, using demo room:', err.message);
    return demoProvider.createMeeting({ booking, trainer });
  }
}

export async function cancelMeetingFor(booking) {
  if (!booking.meeting || booking.meeting.isDemo || !booking.meeting.meetingId) return;
  try {
    await zoomProvider.cancelMeeting(booking.meeting.meetingId);
  } catch (err) {
    console.error('cancel meeting failed', err.message);
  }
}

export { zoomProvider };
