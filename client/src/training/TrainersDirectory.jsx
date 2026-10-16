import { Link } from 'react-router-dom';
import { LuCalendarPlus, LuUsers } from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { RatingLine, TrainerPhoto } from '../components/TrainerCard.jsx';
import { AsyncBlock, EmptyState } from '../components/States.jsx';
import { formatDateTime } from '../utils/format.js';
import { PageHead } from './common.jsx';

/** Learner dashboard: every active trainer with photo, rating, bio and availability. */
export function TrainersDirectory() {
  useSeo({ title: 'Trainers', noindex: true });
  const { data, loading, error, reload } = useFetch('/slots/trainers');
  return (
    <div>
      <PageHead title="Our trainers" description="Browse trainer profiles, ratings and learner feedback, then book a time that suits you." />
      <AsyncBlock loading={loading && !data} error={error} onRetry={reload} empty={!data?.length} emptyState={<EmptyState icon={LuUsers} title="No trainers yet" message="Trainers will appear here once an administrator registers them." />}>
        <div className="grid grid-3">
          {data?.map((t) => (
            <article className="card card-pad" key={t._id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ maxWidth: 140 }}><TrainerPhoto trainer={t} /></div>
              <div>
                <h3 style={{ margin: 0 }}><Link to={`/trainers/${t.slug}`}>{t.displayName}</Link></h3>
                <div className="muted small">{t.title}{t.experienceYears ? ` · ${t.experienceYears}+ yrs` : ''}</div>
              </div>
              <RatingLine rating={t.rating} />
              {t.shortBio && <p className="small" style={{ margin: 0 }}>{t.shortBio}</p>}
              {!!t.specialties?.length && <div className="chips" style={{ justifyContent: 'flex-start' }}>{t.specialties.slice(0, 4).map((s) => <span key={s} className="chip">{s}</span>)}</div>}
              <p className="small muted" style={{ margin: 0 }}>{t.openSlots ? `${t.openSlots} open slot${t.openSlots === 1 ? '' : 's'} · next ${formatDateTime(t.nextSlot)}` : 'No open slots right now'}</p>
              <div className="row" style={{ marginTop: 'auto' }}>
                <Link to={`/trainers/${t.slug}`} className="btn btn-outline btn-sm">Profile &amp; feedback</Link>
                <Link to={`/dashboard/book?trainer=${t.user}`} className="btn btn-sm"><LuCalendarPlus /> Book</Link>
              </div>
            </article>
          ))}
        </div>
      </AsyncBlock>
    </div>
  );
}
