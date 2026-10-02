import { Link } from 'react-router-dom';
import { initials } from '../utils/format.js';

export function TrainerPhoto({ trainer }) {
  return (
    <div className="trainer-photo">
      {trainer.photo ? <img src={trainer.photo} alt={trainer.displayName} loading="lazy" /> : <span className="trainer-initials" aria-hidden>{initials(trainer.displayName)}</span>}
    </div>
  );
}

export function TrainerCard({ trainer }) {
  return (
    <article className="trainer-card">
      <TrainerPhoto trainer={trainer} />
      <h3><Link to={`/trainers/${trainer.slug}`}>{trainer.displayName}</Link></h3>
      <div className="role">{trainer.title}</div>
      {!!trainer.specialties?.length && (
        <div className="chips">
          {trainer.specialties.slice(0, 3).map((s) => <span key={s} className="chip">{s}</span>)}
        </div>
      )}
    </article>
  );
}
