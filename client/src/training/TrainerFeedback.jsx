import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuStar } from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../services/api.js';
import { Modal } from '../components/Modal.jsx';
import { Alert, EmptyState, ErrorState, Loader } from '../components/States.jsx';
import { formatDate, formatDateTime } from '../utils/format.js';
import { BookingBadge } from './common.jsx';

export function Stars({ value, size = 16 }) {
  return (
    <span className="stars" role="img" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => <LuStar key={n} size={size} fill={n <= Math.round(value) ? 'currentColor' : 'none'} aria-hidden />)}
    </span>
  );
}

function StarInput({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Rating" style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => onChange(n)}
          className="icon-btn" style={{ color: n <= value ? 'var(--gold-700)' : 'var(--line-strong)' }}>
          <LuStar size={26} fill={n <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  );
}

export function FeedbackModal({ booking, onClose, onSaved }) {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    if (!rating) return setErr('Please choose a star rating.');
    setBusy(true); setErr('');
    try {
      await api.post('/feedback', { bookingId: booking._id, rating, comment: comment.trim() || undefined });
      toast.success('Thank you for your feedback!');
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
    return null;
  };
  return (
    <Modal open onClose={onClose} size="sm" title="Rate this session"
      footer={<><button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button><button type="button" className="btn btn-sm" disabled={busy} onClick={submit}>{busy && <span className="spinner" aria-hidden />} Submit feedback</button></>}>
      <p style={{ marginTop: 0 }} className="small muted">Session on {formatDateTime(booking.startAt)}</p>
      {err && <div style={{ marginBottom: 12 }}><Alert>{err}</Alert></div>}
      <StarInput value={rating} onChange={setRating} />
      <label className="label" htmlFor="fb-comment" style={{ marginTop: 14, display: 'block' }}>Comments (optional)</label>
      <textarea id="fb-comment" className="textarea" rows={4} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What went well? What could be better?" />
    </Modal>
  );
}

/** Shown on a trainer's public page: the learner's own sessions + feedback form, and everyone's reviews. */
export function TrainerFeedbackSection({ trainer }) {
  const { user, isAuthenticated } = useAuth();
  const key = trainer.slug || trainer._id;
  const reviews = useFetch(`/feedback/trainer/${key}`);
  const isLearner = isAuthenticated && user.role === 'learner';
  const mine = useFetch(isLearner ? `/feedback/trainer/${key}/mine` : null);
  const [rating, setRating] = useState(null);
  const done = () => { setRating(null); reviews.reload(); mine.reload(); };

  return (
    <>
      {isLearner && (
        <section className="section-sm" aria-labelledby="my-sessions-title">
          <div className="container">
            <h2 id="my-sessions-title">Your sessions with {trainer.displayName.split(' ')[0]}</h2>
            {mine.error ? <ErrorState error={mine.error} onRetry={mine.reload} /> : mine.loading && !mine.data ? <Loader /> : !mine.data?.length ? (
              <EmptyState title="No sessions yet" message="Book a session with this trainer, then come back to share your feedback." action={<Link to="/dashboard/book" className="btn btn-sm">Book a session</Link>} />
            ) : (
              <div className="table-wrap">
                <table className="table table-responsive">
                  <thead><tr><th>Date</th><th>Status</th><th>Your feedback</th></tr></thead>
                  <tbody>
                    {mine.data.map((b) => (
                      <tr key={b._id}>
                        <td data-label="Date">{formatDateTime(b.startAt)}</td>
                        <td data-label="Status"><BookingBadge status={b.status} /></td>
                        <td data-label="Your feedback">
                          {b.feedback ? <div><Stars value={b.feedback.rating} />{b.feedback.comment && <div className="cell-sub">{b.feedback.comment}</div>}</div>
                            : b.status === 'completed' ? <button type="button" className="btn btn-outline btn-sm" onClick={() => setRating(b)}>Leave feedback</button>
                              : <span className="muted small">Available once completed</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="section-sm section-white" aria-labelledby="reviews-title">
        <div className="container">
          <div className="row-between" style={{ marginBottom: 16 }}>
            <h2 id="reviews-title" style={{ margin: 0 }}>Learner feedback</h2>
            {reviews.data?.count > 0 && <span><Stars value={reviews.data.average} size={18} /> <strong>{reviews.data.average}</strong> <span className="muted small">({reviews.data.count} review{reviews.data.count === 1 ? '' : 's'})</span></span>}
          </div>
          {reviews.error ? <ErrorState error={reviews.error} onRetry={reviews.reload} /> : reviews.loading && !reviews.data ? <Loader /> : !reviews.data?.items.length ? (
            <EmptyState title="No feedback yet" message="Learners can rate a session once it has been completed." />
          ) : (
            <div className="grid grid-3">
              {reviews.data.items.map((f) => (
                <figure className="card testimonial" key={f._id} style={{ margin: 0 }}>
                  <Stars value={f.rating} />
                  {f.comment && <blockquote>{f.comment}</blockquote>}
                  <footer><div><strong>{f.learner}</strong><span>{formatDate(f.createdAt)}</span></div></footer>
                </figure>
              ))}
            </div>
          )}
        </div>
      </section>
      {rating && <FeedbackModal booking={rating} onClose={() => setRating(null)} onSaved={done} />}
    </>
  );
}
