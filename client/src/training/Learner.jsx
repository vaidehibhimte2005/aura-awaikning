import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LuCalendarPlus, LuCircleCheck, LuHistory, LuPackage, LuTriangleAlert } from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../services/api.js';
import { Modal } from '../components/Modal.jsx';
import { Alert, AsyncBlock, EmptyState, ErrorState, Loader } from '../components/States.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { formatDate, formatDateTime, formatPrice, formatTime } from '../utils/format.js';
import { BookingBadge, PageHead, PhaseBadge, Stat } from './common.jsx';
import { BookingCard } from './BookingCard.jsx';
import { PlanCard, SlotPicker } from './shared.jsx';
import { FeedbackModal, Stars } from './TrainerFeedback.jsx';
import { usePlanPurchase } from './usePlanPurchase.jsx';

const dayDiff = (to) => Math.max(0, Math.ceil((new Date(to) - Date.now()) / 86400000));

function PackageSummary({ sub, remainingDays }) {
  if (!sub) return null;
  const pct = Math.min(100, Math.round((sub.daysUsed / sub.trainingDays) * 100));
  const upcoming = sub.phase === 'upcoming';
  return (
    <section className="pkg-card" aria-label="Your package">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="eyebrow" style={{ color: 'var(--gold)' }}>Your package</div>
          <h2>{sub.packageName}</h2>
        </div>
        <PhaseBadge phase={sub.phase} />
      </div>
      <div>
        <div className="meter-row"><span>Training days used</span><span>{sub.daysUsed} of {sub.trainingDays}</span></div>
        <div className="meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Training days used"><span style={{ width: `${pct}%` }} /></div>
      </div>
      <dl className="pkg-facts">
        <div><dt>Remaining days</dt><dd>{remainingDays ?? sub.remainingDays}</dd></div>
        <div><dt>Completed sessions</dt><dd>{sub.sessionsCompleted}</dd></div>
        <div><dt>{upcoming ? 'Starts' : 'Started'}</dt><dd style={{ fontSize: '1.2rem' }}>{formatDate(sub.startsAt)}</dd></div>
        <div><dt>Expires</dt><dd style={{ fontSize: '1.2rem' }}>{formatDate(sub.expiresAt)} <small>{sub.phase === 'active' ? `(${dayDiff(sub.expiresAt)}d left)` : ''}</small></dd></div>
      </dl>
      <p className="small" style={{ margin: 0, color: 'rgba(255,255,255,0.65)' }}>A training day is only used when a session is completed — booked or missed days don’t count, and the expiry date is separate from days used.</p>
    </section>
  );
}

export function LearnerOverview() {
  useSeo({ title: 'My training', noindex: true });
  const subs = useFetch('/subscriptions/me');
  const upcoming = useFetch('/bookings/me', { when: 'upcoming', limit: 5 });
  if (subs.error) return <ErrorState error={subs.error} onRetry={subs.reload} />;
  if (subs.loading && !subs.data) return <Loader />;
  const { current, remainingDays, availableToBook } = subs.data;
  const expiringSoon = current?.phase === 'active' && (dayDiff(current.expiresAt) <= 3 || current.remainingDays <= 1);
  return (
    <div>
      <PageHead title="My training" description="Your package, upcoming sessions and next steps.">
        <Link to="/dashboard/book" className="btn"><LuCalendarPlus /> Book a session</Link>
      </PageHead>
      {!current && (
        <EmptyState icon={LuPackage} title="Choose a plan to begin" message="Pick a daily, weekly or monthly plan, then book live sessions with a trainer whenever it suits you." action={<Link to="/dashboard/plans" className="btn">View plans</Link>} />
      )}
      {current && <PackageSummary sub={current} remainingDays={remainingDays} />}
      {expiringSoon && (
        <div style={{ marginBottom: 20 }}>
          <Alert type="warning">Your package is nearly finished ({current.remainingDays} day{current.remainingDays === 1 ? '' : 's'} left, expires {formatDate(current.expiresAt)}). <Link to="/dashboard/plans">Renew or upgrade</Link> to keep training.</Alert>
        </div>
      )}
      {current && (
        <div className="stats">
          <Stat label="Available to book" value={availableToBook} sub="Days not yet reserved" />
          <Stat label="Sessions completed" value={current.sessionsCompleted} />
        </div>
      )}
      <section className="panel-card">
        <div className="panel-card-head"><h2>Upcoming sessions</h2><Link to="/dashboard/bookings" className="btn btn-text btn-sm">All bookings</Link></div>
        <div className="panel-card-body">
          <AsyncBlock loading={upcoming.loading && !upcoming.data} error={upcoming.error} onRetry={upcoming.reload} empty={!upcoming.data?.length} emptyState={<p className="muted" style={{ margin: 0 }}>No upcoming sessions. <Link to="/dashboard/book">Book one</Link>.</p>}>
            <div className="booking-list">{upcoming.data?.map((b) => <BookingCard key={b._id} b={b} role="learner" onChanged={() => { upcoming.reload(); subs.reload(); }} />)}</div>
          </AsyncBlock>
        </div>
      </section>
    </div>
  );
}

export function PlansPage() {
  useSeo({ title: 'Plans', noindex: true });
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const pkgs = useFetch('/packages');
  const subs = useFetch('/subscriptions/me');
  const [message, setMessage] = useState({ type: '', text: '' });
  const { buy, busy, modal } = usePlanPurchase({
    onPaid: () => { toast.success('Payment verified — your package is active!'); setMessage({ type: 'success', text: 'Payment verified. Your package is active — you can book sessions now.' }); subs.reload(); },
    onError: (text) => setMessage({ type: 'error', text }),
  });

  // Landing-page hand-off: /dashboard/plans?plan=<id> starts that plan's checkout once.
  const auto = useRef(false);
  const planParam = params.get('plan');
  useEffect(() => {
    if (!planParam || auto.current || !pkgs.data || !subs.data) return;
    auto.current = true;
    const pkg = pkgs.data.packages.find((p) => p._id === planParam);
    setParams({}, { replace: true });
    if (pkg) buy(pkg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planParam, pkgs.data, subs.data]);
  useEffect(() => { if (params.get('paid')) { setMessage({ type: 'success', text: 'Payment verified. Your package is active.' }); setParams({}, { replace: true }); subs.reload(); } }, []); // eslint-disable-line

  if (pkgs.error) return <ErrorState error={pkgs.error} onRetry={pkgs.reload} />;
  if (pkgs.loading && !pkgs.data) return <Loader />;
  const { current, subscriptions } = subs.data || {};
  const live = (subscriptions || []).filter((s) => ['active', 'upcoming', 'exhausted'].includes(s.phase));
  const biggest = Math.max(0, ...live.map((s) => s.trainingDays));

  return (
    <div>
      <PageHead title="Training plans" description="Prices are calculated on our server from the current daily rate. You only pay once, and your package activates after the payment is verified." />
      {message.text && <div style={{ marginBottom: 18 }}><Alert type={message.type === 'success' ? 'success' : 'error'}>{message.text}</Alert></div>}
      {current && <PackageSummary sub={current} remainingDays={subs.data.remainingDays} />}
      {live.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <Alert type="info">You already have an active package. You can <strong>renew</strong> when you are nearly out of days or close to expiry (it starts when your current one ends), or <strong>upgrade</strong> to a larger plan at any time.</Alert>
        </div>
      )}
      <div className="plan-grid" style={{ marginTop: 8 }}>
        {pkgs.data.packages.map((p) => (
          <PlanCard key={p._id} pkg={p}>
            <div className="plan-actions">
              {!live.length ? (
                <button type="button" className="btn btn-gold" disabled={busy} onClick={() => { setMessage({}); buy(p); }}>{busy && <span className="spinner" aria-hidden />} Buy {p.name}</button>
              ) : (
                <>
                  <button type="button" className="btn" disabled={busy} onClick={() => { setMessage({}); buy(p, 'renew'); }}>Renew with {p.name}</button>
                  {p.price.trainingDays > biggest && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => { setMessage({}); buy(p, 'upgrade'); }}>Upgrade to {p.name}</button>}
                </>
              )}
            </div>
          </PlanCard>
        ))}
      </div>
      {subs.data && subscriptions.length > 0 && (
        <section className="panel-card" style={{ marginTop: 28 }}>
          <div className="panel-card-head"><h2>Package history</h2></div>
          <div className="table-wrap">
            <table className="table table-responsive">
              <thead><tr><th>Package</th><th>Period</th><th>Days used</th><th>Paid</th><th>Status</th></tr></thead>
              <tbody>
                {subscriptions.map((s) => (
                  <tr key={s._id}>
                    <td data-label="Package">{s.packageName}<div className="cell-sub">{s.purchaseMode}</div></td>
                    <td data-label="Period">{formatDate(s.startsAt)} → {formatDate(s.expiresAt)}</td>
                    <td data-label="Days used">{s.daysUsed} / {s.trainingDays}</td>
                    <td data-label="Paid">{formatPrice(s.pricing?.amount, s.pricing?.currency)}</td>
                    <td data-label="Status"><PhaseBadge phase={s.phase} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {modal}
    </div>
  );
}

export function BookSession() {
  useSeo({ title: 'Book a session', noindex: true });
  const navigate = useNavigate();
  const toast = useToast();
  const [sp] = useSearchParams();
  const subs = useFetch('/subscriptions/me');
  const [pick, setPick] = useState(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const confirm = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.post('/bookings', { slotId: pick._id, notes: notes.trim() || undefined });
      toast.success('Session confirmed!');
      navigate('/dashboard/bookings');
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  if (subs.loading && !subs.data) return <Loader />;
  const available = subs.data?.availableToBook ?? 0;

  return (
    <div>
      <PageHead title="Book a session" description="Choose a trainer and one of the times they have published. Your booking is confirmed instantly — no waiting for approval." />
      {!subs.data?.current ? (
        <EmptyState icon={LuPackage} title="You need an active plan to book" message="Choose a plan first, then come back to pick a time." action={<Link to="/dashboard/plans" className="btn">View plans</Link>} />
      ) : (
        <>
          {available < 1 && (
            <div style={{ marginBottom: 18 }}>
              <Alert type="warning"><LuTriangleAlert aria-hidden style={{ verticalAlign: '-2px' }} /> You have no training days left to book. <Link to="/dashboard/plans">Renew or upgrade</Link>.</Alert>
            </div>
          )}
          <p className="muted" style={{ marginTop: 0 }}>{available} training day{available === 1 ? '' : 's'} available to book · package valid until {formatDate(subs.data.current.expiresAt)}.</p>
          <SlotPicker initialTrainer={sp.get('trainer') || ''} onPick={(s) => { setErr(''); setPick(s); }} />
        </>
      )}
      <Modal
        open={!!pick}
        onClose={() => setPick(null)}
        title="Confirm your session"
        size="sm"
        footer={<><button type="button" className="btn btn-outline btn-sm" onClick={() => setPick(null)}>Back</button><button type="button" className="btn btn-sm" disabled={busy} onClick={confirm}>{busy && <span className="spinner" aria-hidden />} Confirm booking</button></>}
      >
        {pick && (
          <>
            <p style={{ marginTop: 0 }}><strong>{formatDate(pick.start, { weekday: 'long', day: 'numeric', month: 'long' })}</strong><br />{formatTime(pick.start)} – {formatTime(pick.end)} ({pick.durationMin} min)</p>
            <p className="small muted">This uses one training day only when the session is completed. You can cancel or reschedule up to the cut-off before it starts.</p>
            {err && <div style={{ marginBottom: 12 }}><Alert>{err}</Alert></div>}
            <label className="label" htmlFor="book-notes">Note for your trainer (optional)</label>
            <textarea id="book-notes" className="textarea" rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </>
        )}
      </Modal>
    </div>
  );
}

export function MyBookings() {
  useSeo({ title: 'My bookings', noindex: true });
  const [tab, setTab] = useState('upcoming');
  const { data, loading, error, reload } = useFetch('/bookings/me', { when: tab, limit: 50 });
  return (
    <div>
      <PageHead title="My bookings" description="Meeting links are visible only to you and your trainer.">
        <Link to="/dashboard/book" className="btn btn-sm"><LuCalendarPlus /> Book a session</Link>
      </PageHead>
      <div className="tabs" role="tablist" aria-label="Booking filter">
        {['upcoming', 'past'].map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t === 'upcoming' ? 'Upcoming' : 'Past'}</button>)}
      </div>
      <AsyncBlock loading={loading && !data} error={error} onRetry={reload} empty={!data?.length} emptyState={<EmptyState icon={LuCalendarPlus} title={tab === 'upcoming' ? 'No upcoming sessions' : 'No past sessions'} message={tab === 'upcoming' ? 'Book a time that suits you.' : 'Completed and cancelled sessions will appear here.'} action={tab === 'upcoming' ? <Link to="/dashboard/book" className="btn btn-sm">Book a session</Link> : null} />}>
        <div className="booking-list">{data?.map((b) => <BookingCard key={b._id} b={b} role="learner" onChanged={reload} />)}</div>
      </AsyncBlock>
    </div>
  );
}

export function TrainingHistory() {
  useSeo({ title: 'Training history', noindex: true });
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useFetch('/bookings/me', { when: 'past', page, limit: 15 });
  const [rating, setRating] = useState(null);
  return (
    <div>
      <PageHead title="Training history" description="Every past session and what it meant for your package." />
      <AsyncBlock loading={loading && !data} error={error} onRetry={reload} empty={!data?.length} emptyState={<EmptyState icon={LuHistory} title="No history yet" message="Your completed sessions will be listed here." />}>
        <div className="table-wrap">
          <table className="table table-responsive">
            <thead><tr><th>Date</th><th>Trainer</th><th>Package</th><th>Outcome</th><th>Training day</th><th>Feedback</th></tr></thead>
            <tbody>
              {data?.map((b) => (
                <tr key={b._id}>
                  <td data-label="Date">{formatDateTime(b.startAt)}</td>
                  <td data-label="Trainer">{b.trainer?.name}</td>
                  <td data-label="Package">{b.subscription?.packageName}</td>
                  <td data-label="Outcome"><BookingBadge status={b.status} />{b.outcome?.reason && b.status !== 'completed' && <div className="cell-sub">{b.cancelReason || b.outcome.reason}</div>}</td>
                  <td data-label="Training day">{b.status === 'completed' ? (b.outcome?.countedAsTrainingDay ? <span className="badge badge-success"><LuCircleCheck aria-hidden /> Used</span> : 'Same day') : 'Not used'}</td>
                  <td data-label="Feedback">{b.status !== 'completed' ? '—' : b.feedback ? <Stars value={b.feedback.rating} /> : <button type="button" className="btn btn-outline btn-sm" onClick={() => setRating(b)}>Rate trainer</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AsyncBlock>
      {meta && <Pagination page={meta.page} pages={meta.pages} onChange={setPage} />}
      {rating && <FeedbackModal booking={rating} onClose={() => setRating(null)} onSaved={() => { setRating(null); reload(); }} />}
    </div>
  );
}
