import { Link } from 'react-router-dom';
import { LuCalendar, LuClock, LuMapPin, LuUser, LuYoutube } from 'react-icons/lu';
import { formatDate, formatTime, relativeStart, sessionState, titleCase } from '../utils/format.js';

export function SessionStateBadge({ state }) {
  if (state === 'live') return <span className="badge badge-live">Live now</span>;
  if (state === 'completed') return <span className="badge badge-muted">Completed</span>;
  return <span className="badge badge-gold">Upcoming</span>;
}

/** Primary CTA follows the session state: Join Live / Watch Recording / details. */
export function sessionCta(session) {
  const state = sessionState(session);
  if (state === 'live') return { label: 'Join Live', variant: '' };
  if (state === 'completed') return { label: session.recordingId ? 'Watch Recording' : 'View Details', variant: 'btn-outline' };
  if (session.requiresRegistration && !session.isRegistered) return { label: 'Register', variant: 'btn-outline' };
  return { label: 'View Details', variant: 'btn-outline' };
}

export function LiveSessionCard({ session, basePath }) {
  const state = sessionState(session);
  const start = new Date(session.startAt);
  const cta = sessionCta(session);
  const path = `${basePath || (session.kind === 'event' ? '/events' : '/live-sessions')}/${session.slug}`;
  return (
    <article className={`card session-card${state === 'live' ? ' is-live' : ''}`}>
      <div className="session-date" aria-hidden>
        <span className="day">{start.getDate()}</span>
        <span className="mon">{start.toLocaleString('en', { month: 'short' })}</span>
      </div>
      <div>
        <div className="row" style={{ marginBottom: 8, gap: 8 }}>
          <SessionStateBadge state={state} />
          {session.kind === 'event' && session.mode && <span className="badge">{titleCase(session.mode)}</span>}
        </div>
        <h3><Link to={path}>{session.title}</Link></h3>
        <div className="session-info">
          <span><LuCalendar aria-hidden /> {formatDate(session.startAt)}</span>
          <span><LuClock aria-hidden /> {formatTime(session.startAt)} – {formatTime(session.endAt)}</span>
          {session.trainer && <span><LuUser aria-hidden /> {session.trainer.displayName}</span>}
          {session.venue ? <span><LuMapPin aria-hidden /> {session.venue}</span> : <span><LuYoutube aria-hidden /> YouTube Live</span>}
        </div>
        {state === 'upcoming' && <div className="session-status">{relativeStart(session.startAt)}</div>}
      </div>
      <div className="session-cta">
        <Link to={path} className={`btn btn-sm ${cta.variant}`}>{cta.label}</Link>
      </div>
    </article>
  );
}
