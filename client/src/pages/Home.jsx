import { Link } from 'react-router-dom';
import { LuArrowRight, LuCalendar, LuClock, LuStar, LuUser, LuYoutube } from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { useSite } from '../context/SiteContext.jsx';
import { AuraRings } from '../components/Brand.jsx';
import { CourseGrid } from '../components/CourseCard.jsx';
import { TrainerCard } from '../components/TrainerCard.jsx';
import { SessionStateBadge, sessionCta } from '../components/LiveSessionCard.jsx';
import { YouTubePlayer } from '../components/YouTubePlayer.jsx';
import { SectionHeading } from '../components/SectionHeading.jsx';
import { ErrorState } from '../components/States.jsx';
import { formatDate, formatTime, initials, relativeStart, sessionState } from '../utils/format.js';

/** Splits "Awaken the awareness within." so the last two words render in gold italics. */
function HeroTitle({ text }) {
  const words = text.trim().split(' ');
  if (words.length < 3) return <h1>{text}</h1>;
  const tail = words.splice(-2).join(' ');
  return <h1>{words.join(' ')} <em>{tail}</em></h1>;
}

function LiveFeature() {
  const { data, loading, error, reload } = useFetch('/live-sessions', { state: 'current', kind: 'session', limit: 1 });
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <div className="skeleton" style={{ height: 320 }} />;
  const s = data?.[0];
  if (!s) {
    return (
      <div className="live-feature">
        <div className="live-feature-body" style={{ gridColumn: '1 / -1', textAlign: 'center', alignItems: 'center' }}>
          <h3>New live circles are being scheduled</h3>
          <p>Browse past recordings while you wait.</p>
          <Link to="/live-sessions" className="btn btn-gold">See Recordings</Link>
        </div>
      </div>
    );
  }
  const state = sessionState(s);
  const cta = sessionCta(s);
  return (
    <div className="live-feature">
      <div className="live-feature-media">
        <YouTubePlayer videoId={s.youtubeId} title={s.title} live={state === 'live'} />
      </div>
      <div className="live-feature-body">
        <div><SessionStateBadge state={state} /></div>
        <h3>{s.title}</h3>
        {state === 'upcoming' && <div className="countdown">{relativeStart(s.startAt)}</div>}
        <div className="session-info">
          <span><LuCalendar aria-hidden /> {formatDate(s.startAt)}</span>
          <span><LuClock aria-hidden /> {formatTime(s.startAt)}</span>
          {s.trainer && <span><LuUser aria-hidden /> {s.trainer.displayName}</span>}
          <span><LuYoutube aria-hidden /> YouTube Live</span>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <Link to={`/live-sessions/${s.slug}`} className="btn btn-gold">{state === 'live' ? 'Join Live Session' : cta.label}</Link>
          <Link to="/live-sessions" className="link-arrow" style={{ color: 'var(--white)' }}>All sessions <LuArrowRight size={14} /></Link>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { settings } = useSite();
  const h = settings.homepage || {};
  const hero = h.hero || {};
  const intro = h.intro || {};
  const philosophy = h.philosophy || {};
  const cta = h.cta || {};

  useSeo({
    title: null,
    description: hero.subtitle || 'Guided programs, live sessions and practices for awareness, mindfulness and personal growth.',
  });

  const courses = useFetch('/courses', { featured: 'true', limit: 3 });
  const trainers = useFetch('/trainers', { limit: 4 });
  const testimonials = useFetch('/testimonials', { limit: 3 });

  return (
    <>
      {/* ───── Hero ───── */}
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <div className="eyebrow">{hero.eyebrow || 'Aura Awakening'}</div>
            <HeroTitle text={hero.title || 'Awaken the awareness within.'} />
            <p className="lead">{hero.subtitle}</p>
            <div className="hero-actions">
              <Link to="/courses" className="btn btn-gold">{hero.primaryCta || 'Explore Programs'}</Link>
              <Link to="/live-sessions" className="btn btn-ghost-light">{hero.secondaryCta || 'Join a Live Session'}</Link>
            </div>
            {!!intro.stats?.length && (
              <div className="hero-meta">
                {intro.stats.map((s) => (
                  <div key={s.label}><strong>{s.value}</strong><span>{s.label}</span></div>
                ))}
              </div>
            )}
          </div>
          <div className="hero-visual">
            <AuraRings animated rings={6} />
          </div>
        </div>
      </section>

      {/* ───── Introduction ───── */}
      <section className="section section-white">
        <div className="container split">
          <div>
            <div className="eyebrow">What is Aura Awakening</div>
            <h2>{intro.title || 'A sanctuary for the inner journey'}</h2>
            <p className="lead">{intro.body}</p>
            <Link to="/about" className="link-arrow" style={{ marginTop: 12 }}>Our story <LuArrowRight size={14} /></Link>
          </div>
          <figure className="quote-panel" style={{ margin: 0 }}>
            <p>“Awareness is not something you achieve. It is what remains when you stop running from the present.”</p>
            <cite>The Aura Awakening way</cite>
            <AuraRings className="ornament" rings={4} />
          </figure>
        </div>
      </section>

      {/* ───── Programs ───── */}
      <section className="section section-cream">
        <div className="container">
          <div className="row-between" style={{ alignItems: 'flex-end', marginBottom: 'clamp(32px, 5vw, 56px)' }}>
            <SectionHeading eyebrow="Learning programs" title="Paths for every season of life" lead="Structured, self-paced programs taught by experienced guides — begin free, go deeper when you are ready." />
            <Link to="/courses" className="link-arrow" style={{ marginBottom: 'clamp(32px, 5vw, 56px)' }}>All programs <LuArrowRight size={14} /></Link>
          </div>
          {courses.error ? <ErrorState error={courses.error} onRetry={courses.reload} /> : <CourseGrid courses={courses.data} loading={courses.loading} emptyMessage="New programs are on their way." />}
        </div>
      </section>

      {/* ───── Live sessions ───── */}
      <section className="section section-dark">
        <div className="container">
          <SectionHeading eyebrow="Live on YouTube" title="Practice together, in real time" lead="Weekly guided circles and Q&A sessions streamed live. Join from anywhere — recordings follow for those who can't make it." />
          <LiveFeature />
        </div>
      </section>

      {/* ───── Trainers ───── */}
      <section className="section section-white">
        <div className="container">
          <SectionHeading center eyebrow="Your guides" title="Learn from experienced teachers" lead="Each guide brings years of personal practice and a gentle, grounded way of teaching." />
          {trainers.error ? (
            <ErrorState error={trainers.error} onRetry={trainers.reload} />
          ) : (
            <div className="grid grid-4">
              {(trainers.data || []).map((t) => <TrainerCard key={t._id} trainer={t} />)}
            </div>
          )}
          <div className="center" style={{ marginTop: 40 }}>
            <Link to="/trainers" className="btn btn-outline">Meet All Trainers</Link>
          </div>
        </div>
      </section>

      {/* ───── Philosophy ───── */}
      <section className="section section-dark" style={{ background: 'var(--green-950)' }}>
        <div className="container">
          <SectionHeading eyebrow="Philosophy" title={philosophy.title || 'Our approach'} lead={philosophy.subtitle} />
          <div className="grid grid-4">
            {(philosophy.pillars || []).map((p, i) => (
              <div className="pillar" key={p.title}>
                <span className="pillar-num">0{i + 1}</span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── Testimonials ───── */}
      {!!testimonials.data?.length && (
        <section className="section section-cream">
          <div className="container">
            <SectionHeading center eyebrow="Kind words" title="Stories from our community" />
            <div className="grid grid-3">
              {testimonials.data.map((t) => (
                <figure className="card testimonial" key={t._id} style={{ margin: 0 }}>
                  <div className="stars" aria-label={`${t.rating || 5} out of 5`}>
                    {Array.from({ length: t.rating || 5 }).map((_, i) => <LuStar key={i} fill="currentColor" aria-hidden />)}
                  </div>
                  <blockquote>{t.quote}</blockquote>
                  <footer>
                    <span className="avatar" aria-hidden>{t.avatar ? <img src={t.avatar} alt="" /> : initials(t.name)}</span>
                    <div><strong>{t.name}</strong><span>{t.role}</span></div>
                  </footer>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ───── CTA ───── */}
      <section className="section section-dark cta-band">
        <AuraRings className="bg-rings" rings={7} />
        <div className="container container-narrow" style={{ position: 'relative' }}>
          <div className="divider-ornament" aria-hidden>✦</div>
          <h2 style={{ marginTop: 20 }}>{cta.title || 'Begin your journey inward.'}</h2>
          <p className="lead">{cta.body}</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link to="/register" className="btn btn-gold">{cta.buttonLabel || 'Begin Your Journey'}</Link>
            <Link to="/courses?price=free" className="btn btn-ghost-light">Try a Free Program</Link>
          </div>
        </div>
      </section>
    </>
  );
}
