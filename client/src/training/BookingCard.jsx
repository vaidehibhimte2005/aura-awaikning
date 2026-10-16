import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCalendarClock, LuVideo, LuX } from 'react-icons/lu';
import { api } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { ConfirmDialog, Modal } from '../components/Modal.jsx';
import { Alert } from '../components/States.jsx';
import { TextField } from '../components/Form.jsx';
import { formatDate, formatTime, relativeStart } from '../utils/format.js';
import { BookingBadge } from './common.jsx';
import { SlotPicker } from './shared.jsx';
import { FeedbackModal, Stars } from './TrainerFeedback.jsx';

function JoinButton({ b, role }) {
  if (b.status !== 'confirmed' || !b.meeting) return null;
  const url = role === 'trainer' ? b.meeting.hostUrl || b.meeting.joinUrl : b.meeting.joinUrl;
  const label = b.meeting.isDemo ? 'Open demo room' : 'Join meeting';
  if (b.meeting.isDemo) return <Link to={`/session/${b._id}`} className="btn btn-sm"><LuVideo /> {label}</Link>;
  return <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-sm"><LuVideo /> {label}</a>;
}

/** A single session. `role` is the viewer's side; learners can cancel/reschedule, trainers can cancel with a reason. */
export function BookingCard({ b, role, onChanged }) {
  const toast = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reschedule, setReschedule] = useState(false);
  const [target, setTarget] = useState(null);
  const [rate, setRate] = useState(false);

  const start = new Date(b.startAt);
  const upcoming = b.status === 'confirmed' && new Date(b.endAt) > new Date();
  const other = role === 'trainer' ? b.learner : b.trainer;

  const cancel = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.post(`/bookings/${b._id}/cancel`, { reason: reason.trim() || undefined });
      toast.success('Booking cancelled');
      setCancelOpen(false);
      setReason('');
      onChanged?.();
    } catch (e) { setErr(e.message); toast.error(e.message); setCancelOpen(role !== 'learner'); } finally { setBusy(false); }
  };

  const move = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.post(`/bookings/${b._id}/reschedule`, { slotId: target._id });
      toast.success('Session rescheduled');
      setReschedule(false);
      setTarget(null);
      onChanged?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <article className="booking-card">
      <div className="booking-date" aria-hidden>
        <small>{formatDate(start, { month: 'short' })}</small>
        <b>{start.getDate()}</b>
        <small>{formatDate(start, { weekday: 'short' })}</small>
      </div>
      <div className="booking-main">
        <strong>{formatTime(b.startAt)} – {formatTime(b.endAt)} · {other?.name || 'Session'}</strong>
        <span className="small muted">
          {role === 'trainer' && b.learner && `${b.learner.email ? `${b.learner.email}` : ''}${b.learner.phone ? ` · ${b.learner.phone}` : ''}`}
          {role === 'learner' && b.subscription?.packageName}
          {upcoming && ` · ${relativeStart(b.startAt).replace('Starts', 'starts')}`}
        </span>
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
          <BookingBadge status={b.status} />
          {b.meeting?.isDemo && b.status === 'confirmed' && <span className="badge badge-muted" title="No real video call is created in demo mode">Demo meeting</span>}
          {b.outcome?.countedAsTrainingDay && <span className="badge badge-success">Training day used</span>}
          {b.status === 'completed' && b.outcome?.sameDayAsPrevious && <span className="badge badge-muted">Same-day — no extra day</span>}
        </span>
        {(b.outcome?.reason || b.cancelReason) && !['confirmed', 'completed'].includes(b.status) && <span className="small muted" style={{ display: 'block', marginTop: 4 }}>{b.cancelReason || b.outcome.reason}</span>}
      </div>
      <div className="booking-actions">
        <JoinButton b={b} role={role} />
        {role === 'learner' && b.status === 'completed' && (b.feedback ? <span className="small"><Stars value={b.feedback.rating} /> Your rating</span> : <button type="button" className="btn btn-sm" onClick={() => setRate(true)}>Rate this session</button>)}
        {upcoming && role === 'learner' && (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { setErr(''); setReschedule(true); }}><LuCalendarClock /> Reschedule</button>
        )}
        {upcoming && <button type="button" className="btn btn-outline btn-sm" onClick={() => { setErr(''); setCancelOpen(true); }}><LuX /> Cancel</button>}
      </div>

      {role === 'learner' ? (
        <ConfirmDialog
          open={cancelOpen}
          danger
          busy={busy}
          title="Cancel this session?"
          message="Your training day is not used and the slot opens up for others. Sessions can only be cancelled before the cut-off time."
          confirmLabel="Cancel Session"
          onConfirm={cancel}
          onCancel={() => setCancelOpen(false)}
        />
      ) : (
        <Modal
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          title="Cancel this booking"
          size="sm"
          footer={<><button type="button" className="btn btn-outline btn-sm" onClick={() => setCancelOpen(false)}>Keep booking</button><button type="button" className="btn btn-danger btn-sm" disabled={busy || !reason.trim()} onClick={cancel}>{busy && <span className="spinner" aria-hidden />} Cancel Booking</button></>}
        >
          <p style={{ marginTop: 0 }}>The learner will be notified and asked to rebook. This slot is withdrawn, and the learner keeps their training day.</p>
          {err && <Alert>{err}</Alert>}
          <TextField label="Reason for the learner" required multiline rows={3} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        </Modal>
      )}

      {rate && <FeedbackModal booking={b} onClose={() => setRate(false)} onSaved={() => { setRate(false); onChanged?.(); }} />}
      <Modal
        open={reschedule}
        onClose={() => { setReschedule(false); setTarget(null); }}
        title="Reschedule session"
        size="lg"
        footer={target && <><button type="button" className="btn btn-outline btn-sm" onClick={() => setTarget(null)}>Back</button><button type="button" className="btn btn-sm" disabled={busy} onClick={move}>{busy && <span className="spinner" aria-hidden />} Confirm new time</button></>}
      >
        {err && <div style={{ marginBottom: 12 }}><Alert>{err}</Alert></div>}
        {target ? (
          <p style={{ margin: 0 }}>Move your session to <strong>{formatDate(target.start, { weekday: 'long', day: 'numeric', month: 'long' })}, {formatTime(target.start)} – {formatTime(target.end)}</strong>?</p>
        ) : (
          <SlotPicker onPick={(s) => { setErr(''); setTarget(s); }} pickLabel="Move to" />
        )}
      </Modal>
    </article>
  );
}
