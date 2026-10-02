import { Link, useParams } from 'react-router-dom';
import { LuGlobe, LuInstagram, LuLinkedin, LuYoutube } from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { PageHero } from '../components/SectionHeading.jsx';
import { TrainerCard, TrainerPhoto } from '../components/TrainerCard.jsx';
import { CourseGrid } from '../components/CourseCard.jsx';
import { LiveSessionCard } from '../components/LiveSessionCard.jsx';
import { AsyncBlock, EmptyState, ErrorState, Loader } from '../components/States.jsx';
import { Markdown } from '../utils/markdown.jsx';

export function Trainers() {
  useSeo({ title: 'Trainers', description: 'Meet the experienced meditation, mindfulness and energy guides of Aura Awakening.' });
  const { data, loading, error, reload } = useFetch('/trainers', { limit: 48 });
  return (
    <>
      <PageHero eyebrow="Our guides" title="Teachers who walk the path" lead="Every Aura Awakening trainer is a long-time practitioner first — and a gentle, clear teacher second." />
      <section className="section">
        <div className="container">
          <AsyncBlock loading={loading && !data} error={error} onRetry={reload} empty={!data?.length} emptyState={<EmptyState title="Trainers coming soon" />}>
            <div className="grid grid-4">{data?.map((t) => <TrainerCard key={t._id} trainer={t} />)}</div>
          </AsyncBlock>
        </div>
      </section>
    </>
  );
}

export function TrainerDetail() {
  const { slug } = useParams();
  const { data, loading, error, reload } = useFetch(`/trainers/${slug}`);
  const t = data?.trainer;
  useSeo({ title: t?.displayName, description: t?.shortBio, image: t?.photo });
  if (loading && !data) return <Loader page />;
  if (error) return <div className="container section"><ErrorState error={error} onRetry={reload} /></div>;
  const socials = [
    [t.socials?.website, LuGlobe, 'Website'],
    [t.socials?.instagram, LuInstagram, 'Instagram'],
    [t.socials?.youtube, LuYoutube, 'YouTube'],
    [t.socials?.linkedin, LuLinkedin, 'LinkedIn'],
  ].filter(([href]) => href);
  return (
    <>
      <section className="section section-white">
        <div className="container split" style={{ alignItems: 'start' }}>
          <div style={{ maxWidth: 420 }}><TrainerPhoto trainer={t} /></div>
          <div>
            <nav className="breadcrumbs" aria-label="Breadcrumb" style={{ color: 'var(--muted)' }}>
              <Link to="/trainers" style={{ color: 'var(--gold-700)' }}>Trainers</Link><span aria-hidden>/</span><span>{t.displayName}</span>
            </nav>
            <div className="eyebrow">{t.title}</div>
            <h1 style={{ fontSize: 'clamp(2.4rem, 4.5vw, 3.6rem)' }}>{t.displayName}</h1>
            {!!t.experienceYears && <p className="muted">{t.experienceYears}+ years of practice and teaching</p>}
            <Markdown source={t.bio || t.shortBio} />
            {!!t.specialties?.length && <div className="chips" style={{ justifyContent: 'flex-start' }}>{t.specialties.map((s) => <span className="chip" key={s}>{s}</span>)}</div>}
            {!!socials.length && (
              <div className="row" style={{ marginTop: 24 }}>
                {socials.map(([href, Icon, label]) => <a key={label} className="btn btn-outline btn-sm" href={href} target="_blank" rel="noopener noreferrer"><Icon /> {label}</a>)}
              </div>
            )}
          </div>
        </div>
      </section>
      {!!data.courses.length && (
        <section className="section-sm">
          <div className="container">
            <h2>Programs by {t.displayName.split(' ')[0]}</h2>
            <CourseGrid courses={data.courses.map((c) => ({ ...c, trainers: [t] }))} />
          </div>
        </section>
      )}
      {!!data.sessions.length && (
        <section className="section-sm section-white">
          <div className="container">
            <h2>Upcoming sessions</h2>
            {data.sessions.map((s) => <LiveSessionCard key={s._id} session={{ ...s, trainer: t }} />)}
          </div>
        </section>
      )}
    </>
  );
}
