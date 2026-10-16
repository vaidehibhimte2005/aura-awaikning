import { useMemo, useState } from 'react';
import { LuCheck } from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { EmptyState, ErrorState, Loader } from '../components/States.jsx';
import { formatPrice, formatTime, initials } from '../utils/format.js';
import { fmtDay, localDayKey } from './common.jsx';
import { RatingLine } from '../components/TrainerCard.jsx';

/** One plan. Original price, discount, final price and savings all come from the server. */
export function PlanCard({ pkg, children, featured = pkg.isFeatured }) {
  const p = pkg.price;
  const hasDiscount = p.discount > 0;
  return (
    <article className={`plan-card${featured ? ' is-featured' : ''}`}>
      <div>
        <h3>{pkg.name}</h3>
        {pkg.description && <p className="plan-desc">{pkg.description}</p>}
      </div>
      <div>
        <div className="plan-price">
          <strong>{formatPrice(p.amount, p.currency)}</strong>
          {hasDiscount && <s aria-label={`Original price ${formatPrice(p.baseAmount, p.currency)}`}>{formatPrice(p.baseAmount, p.currency)}</s>}
        </div>
        {hasDiscount && <span className="plan-save">You save {formatPrice(p.savings, p.currency)} ({Math.round(p.discountPct)}% off)</span>}
        <p className="plan-meta" style={{ marginTop: 8 }}>
          {p.trainingDays} training day{p.trainingDays === 1 ? '' : 's'} · valid {p.validityDays} day{p.validityDays === 1 ? '' : 's'} · {formatPrice(Math.round((p.amount / p.trainingDays) * 100) / 100, p.currency)}/day
        </p>
      </div>
      {!!pkg.features?.length && (
        <ul className="plan-features">
          {pkg.features.map((f) => <li key={f}><LuCheck aria-hidden /> {f}</li>)}
        </ul>
      )}
      {children}
    </article>
  );
}

/**
 * Trainer → day → slot chooser used for booking and rescheduling.
 * Only slots the trainer has published as available are ever listed.
 */
export function SlotPicker({ onPick, pickLabel = 'Select', initialTrainer, hideTrainerPicker = false }) {
  const trainers = useFetch('/slots/trainers');
  const [trainerId, setTrainerId] = useState(initialTrainer || '');
  const [day, setDay] = useState('');
  const slots = useFetch(trainerId ? '/slots/available' : null, { trainer: trainerId });

  const byDay = useMemo(() => {
    const m = new Map();
    (slots.data || []).forEach((s) => {
      const k = localDayKey(s.start);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(s);
    });
    return m;
  }, [slots.data]);
  const days = [...byDay.keys()];
  const activeDay = day && byDay.has(day) ? day : days[0];

  if (trainers.error) return <ErrorState error={trainers.error} onRetry={trainers.reload} />;
  if (trainers.loading && !trainers.data) return <Loader />;
  const list = trainers.data || [];

  return (
    <div>
      {!hideTrainerPicker && (
        <>
          <h3 style={{ fontSize: '1.2rem' }}>1. Choose a trainer</h3>
          {!list.length ? <EmptyState title="No trainers available yet" message="Trainers publish their availability here. Please check back soon." /> : (
            <div className="trainer-pick">
              {list.map((t) => (
                <button key={t._id} type="button" className="trainer-opt" aria-pressed={trainerId === t.user} onClick={() => { setTrainerId(t.user); setDay(''); }}>
                  <span className="avatar" aria-hidden>{t.photo ? <img src={t.photo} alt="" /> : initials(t.displayName)}</span>
                  <span>
                    <strong>{t.displayName}</strong>
                    <span className="small muted">{t.title || 'Trainer'}</span>
                    <RatingLine rating={t.rating} />
                    <span className="small" style={{ color: t.openSlots ? 'var(--success)' : 'var(--muted)' }}>{t.openSlots ? `${t.openSlots} open slot${t.openSlots === 1 ? '' : 's'}` : 'No open slots'}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {trainerId && (
        <>
          <h3 style={{ fontSize: '1.2rem' }}>{hideTrainerPicker ? 'Choose a new time' : '2. Pick a day and time'}</h3>
          {slots.error ? <ErrorState error={slots.error} onRetry={slots.reload} /> : slots.loading && !slots.data ? <Loader /> : !days.length ? (
            <EmptyState title="No open slots" message="This trainer has no available slots right now. Try another trainer." />
          ) : (
            <>
              <div className="day-strip" role="group" aria-label="Available days">
                {days.map((k) => {
                  const d = new Date(`${k}T12:00:00`);
                  return (
                    <button key={k} type="button" className="day-btn" aria-pressed={k === activeDay} onClick={() => setDay(k)}>
                      <small>{d.toLocaleDateString('en-IN', { weekday: 'short' })}</small>
                      <b>{d.getDate()}</b>
                      <small>{d.toLocaleDateString('en-IN', { month: 'short' })} · {byDay.get(k).length}</small>
                    </button>
                  );
                })}
              </div>
              <p className="small muted" style={{ marginTop: 0 }}>{fmtDay(byDay.get(activeDay)[0].start)} — times shown in your local time zone.</p>
              <div className="slot-grid">
                {byDay.get(activeDay).map((s) => (
                  <button key={s._id} type="button" className="slot-btn" onClick={() => onPick(s)} aria-label={`${pickLabel} ${formatTime(s.start)} to ${formatTime(s.end)}`}>
                    <b>{formatTime(s.start)}</b>
                    <small>{s.durationMin} min</small>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
