import { Link } from 'react-router-dom';
import { LuStar } from 'react-icons/lu';
import { initials } from '../utils/format.js';

export function TrainerPhoto({ trainer }) {
  return (
    <div className="trainer-photo">
      {trainer.photo ? <img src={trainer.photo} alt={trainer.displayName} loading="lazy" /> : <span className="trainer-initials" aria-hidden>{initials(trainer.displayName)}</span>}
    </div>
  );
}

/** Average star rating, or a quiet "No feedback yet". */
export function RatingLine({ rating }) {
  if (!rating?.count) return <span className="small muted">No feedback yet</span>;
  return (
    <span className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} aria-label={`Rated ${rating.average} out of 5 from ${rating.count} reviews`}>
      <LuStar size={14} fill="currentColor" style={{ color: 'var(--gold-700)' }} aria-hidden /> <strong>{rating.average}</strong> <span className="muted">({rating.count})</span>
    </span>
  );
}

export function TrainerCard({ trainer }) {
  return (
    <article className="trainer-card">
      <TrainerPhoto trainer={trainer} />
      <h3><Link to={`/trainers/${trainer.slug}`}>{trainer.displayName}</Link></h3>
      <div className="role">{trainer.title}</div>
      <div style={{ textAlign: 'center' }}><RatingLine rating={trainer.rating} /></div>
      {!!trainer.specialties?.length && (
        <div className="chips">
          {trainer.specialties.slice(0, 3).map((s) => <span key={s} className="chip">{s}</span>)}
        </div>
      )}
    </article>
  );
}
