import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LuArrowLeft, LuLogIn, LuLogOut, LuTriangleAlert } from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../services/api.js';
import { AuraRings } from '../components/Brand.jsx';
import { Alert, ErrorState, Loader } from '../components/States.jsx';
import { formatDate, formatTime } from '../utils/format.js';
import { BookingBadge } from './common.jsx';

const lastState = (events, role) => {
  const mine = events.filter((e) => e.role === role);
  return mine.length ? mine[mine.length - 1].type === 'join' : false;
};

/**
 * Session page for a booking. With a real provider (Zoom) it just links out. With the DEMO
 * provider it is a stand-in room: no video, and attendance clicked here is stored as "demo".
 */
export default function SessionRoom() {
  useSeo({ title: 'Session', noindex: true });
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { data: b, loading, error, reload } = useFetch(`/bookings/${id}`);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => { reload(); tick((n) => n + 1); }, 10000);
    return () => clearInterval(t);
  }, [reload]);

  if (loading && !b) return <Loader page />;
  if (error) return <div className="container section"><ErrorState error={error} onRetry={reload} /></div>;

  const role = b.viewerRole === 'admin' ? null : b.viewerRole;
  const me = role === 'trainer' ? 'trainer' : 'learner';
  const events = b.events || [];
  const joined = role ? lastState(events, me) : false;
  const start = new Date(b.startAt);
  const end = new Date(b.endAt);
  const now = Date.now();
  const opensAt = start.getTime() - 10 * 60000;
  const tooEarly = now < opensAt;
  const over = now > end.getTime() + 15 * 60000 || b.status !== 'confirmed';
  const back = user.role === 'trainer' ? '/trainer/bookings' : user.role === 'admin' ? '/admin/bookings' : '/dashboard/bookings';

  const send = async (type) => {
    setBusy(true);
    try { await api.post(`/bookings/${id}/attendance`, { type }); toast.success(type === 'join' ? 'You joined the demo room' : 'You left the demo room'); reload(); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="container section-sm">
      <div className="room">
        <Link to={back} className="link-arrow" style={{ marginBottom: 16, display: 'inline-flex' }}><LuArrowLeft size={14} /> Back to bookings</Link>
        <div className="room-stage">
          <AuraRings className="aura" rings={6} />
          <div>
            <div className="eyebrow" style={{ justifyContent: 'center', color: 'var(--gold)' }}>{b.meeting?.isDemo ? 'Demo room' : 'Live session'}</div>
            <h2>{formatDate(start, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
            <p style={{ margin: 0 }}>{formatTime(start)} – {formatTime(end)} · {role === 'trainer' ? b.learner?.name : b.trainer?.name}</p>
          </div>
        </div>

        <div style={{ margin: '18px 0' }}><BookingBadge status={b.status} /></div>

        {b.meeting?.isDemo ? (
          <>
            <Alert type="warning"><LuTriangleAlert aria-hidden style={{ verticalAlign: '-2px' }} /> <strong>Demo meeting.</strong> No real video call exists in this mode. Joining here records <em>demo</em> attendance, which counts toward completion only if an administrator has enabled demo attendance. Connect Zoom for verified attendance.</Alert>
            <div className="presence" aria-live="polite">
              <div><span className={`dot${lastState(events, 'trainer') ? ' on' : ''}`} /> Trainer {lastState(events, 'trainer') ? 'is in the room' : 'not in the room'}</div>
              <div><span className={`dot${lastState(events, 'learner') ? ' on' : ''}`} /> Learner {lastState(events, 'learner') ? 'is in the room' : 'not in the room'}</div>
            </div>
            {role ? (
              <div className="row">
                {!joined ? (
                  <button type="button" className="btn" disabled={busy || tooEarly || over} onClick={() => send('join')}><LuLogIn /> Join demo room</button>
                ) : (
                  <button type="button" className="btn btn-outline" disabled={busy} onClick={() => send('leave')}><LuLogOut /> Leave room</button>
                )}
                {tooEarly && <span className="small muted">Opens 10 minutes before the start time.</span>}
                {over && <span className="small muted">This session is closed.</span>}
              </div>
            ) : <p className="muted">Administrators can view attendance here but cannot record it.</p>}
          </>
        ) : (
          <>
            <p>This session runs on {b.meeting?.provider === 'zoom' ? 'Zoom' : 'an external meeting provider'}. Attendance is recorded automatically by the provider.</p>
            {b.status === 'confirmed' && (
              <a className="btn" href={role === 'trainer' ? b.meeting.hostUrl || b.meeting.joinUrl : b.meeting.joinUrl} target="_blank" rel="noopener noreferrer">Open meeting</a>
            )}
            {b.meeting?.passcode && <p className="small muted">Passcode: <code>{b.meeting.passcode}</code></p>}
          </>
        )}
        {events.length > 0 && (
          <section className="panel-card" style={{ marginTop: 24 }}>
            <div className="panel-card-head"><h2>Attendance log</h2></div>
            <div className="panel-card-body">
              <ul className="timeline">
                {events.map((e, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <li key={i}><strong style={{ fontWeight: 500 }}>{e.role === 'trainer' ? 'Trainer' : 'Learner'} {e.type === 'join' ? 'joined' : 'left'}</strong><span className="small muted">{formatTime(e.at)} · {e.source === 'demo' ? 'demo (unverified)' : 'verified by provider'}</span></li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
