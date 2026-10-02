import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LuCalendar, LuCalendarPlus, LuClock, LuLock, LuMapPin, LuUser, LuUsers, LuYoutube } from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../services/api.js';
import { PageHero } from '../components/SectionHeading.jsx';
import { LiveSessionCard, SessionStateBadge } from '../components/LiveSessionCard.jsx';
import { YouTubePlayer } from '../components/YouTubePlayer.jsx';
import { AsyncBlock, EmptyState, ErrorState, Loader } from '../components/States.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { formatDate, formatTime, relativeStart, sessionState, titleCase } from '../utils/format.js';
import { Markdown } from '../utils/markdown.jsx';

const TABS = [
  { value: 'current', label: 'Live & Upcoming' },
  { value: 'completed', label: 'Recordings' },
];

/** Shared listing for live sessions (kind=session) and events (kind=event). */
export function SessionList({ kind = 'session' }) {
  const isEvent = kind === 'event';
  useSeo({
    title: isEvent ? 'Events & Retreats' : 'Live Sessions',
    description: isEvent ? 'Retreats, workshops and gatherings — online and in person.' : 'Join guided meditation and mindfulness sessions live on YouTube, or watch the recordings.',
  });
  const [tab, setTab] = useState('current');
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useFetch('/live-sessions', { kind, state: tab, page, limit: 10 });
  return (
    <>
      <PageHero
        eyebrow={isEvent ? 'Gatherings' : 'Live on YouTube'}
        title={isEvent ? 'Events, workshops & retreats' : 'Practice together, live'}
        lead={isEvent ? 'Step away from the everyday — join us online or in person.' : 'Guided circles, breathwork and Q&A streamed on YouTube Live. Recordings are added after every session.'}
      />
      <section className="section-sm">
        <div className="container" style={{ maxWidth: 1000 }}>
          <div className="player-tabs" role="tablist" style={{ marginTop: 0 }}>
            {TABS.map((t) => (
              <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => { setTab(t.value); setPage(1); }}>
                {isEvent && t.value === 'completed' ? 'Past events' : t.label}
              </button>
            ))}
          </div>
          <AsyncBlock
            loading={loading && !data}
            error={error}
            onRetry={reload}
            empty={!data?.length}
            emptyState={<EmptyState icon={LuCalendar} title={tab === 'current' ? 'Nothing scheduled right now' : 'No recordings yet'} message="New sessions are announced every week — check back soon." />}
          >
            {data?.map((s) => <LiveSessionCard key={s._id} session={s} />)}
          </AsyncBlock>
          {meta && <Pagination page={meta.page} pages={meta.pages} onChange={setPage} />}
        </div>
      </section>
    </>
  );
}

function addToCalendarUrl(s) {
  const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const p = new URLSearchParams({ action: 'TEMPLATE', text: s.title, dates: `${fmt(s.startAt)}/${fmt(s.endAt)}`, details: `${window.location.href}`, location: s.venue || 'YouTube Live' });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export function SessionDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const { data: s, loading, error, reload } = useFetch(`/live-sessions/${slug}`);
  const [busy, setBusy] = useState(false);
  useSeo({ title: s?.title, description: s?.description?.slice(0, 160), image: s?.thumbnail });

  if (loading && !s) return <Loader page />;
  if (error) return <div className="container section"><ErrorState error={error} onRetry={reload} /></div>;

  const state = sessionState(s);
  const videoId = state === 'completed' ? s.recordingId : s.youtubeId;
  const toggleRegistration = async () => {
    if (!isAuthenticated) return navigate('/login', { state: { from: window.location.pathname } });
    setBusy(true);
    try {
      if (s.isRegistered) await api.delete(`/live-sessions/${s._id}/register`);
      else await api.post(`/live-sessions/${s._id}/register`);
      toast.success(s.isRegistered ? 'Registration cancelled' : 'You are registered — we will remind you before it starts.');
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
    return null;
  };

  return (
    <>
      <section className="course-hero">
        <div className="container course-hero-grid">
          <div>
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              <Link to={s.kind === 'event' ? '/events' : '/live-sessions'}>{s.kind === 'event' ? 'Events' : 'Live sessions'}</Link><span aria-hidden>/</span><span>{s.title}</span>
            </nav>
            <div className="row" style={{ marginBottom: 16 }}>
              <SessionStateBadge state={state} />
              {s.kind === 'event' && <span className="badge badge-gold">{titleCase(s.mode)}</span>}
            </div>
            <h1>{s.title}</h1>
            {state === 'upcoming' && <p className="countdown">{relativeStart(s.startAt)}</p>}
            <div className="course-facts">
              <span><LuCalendar aria-hidden /> {formatDate(s.startAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
              <span><LuClock aria-hidden /> {formatTime(s.startAt)} – {formatTime(s.endAt)}</span>
              {s.trainer && <span><LuUser aria-hidden /> {s.trainer.displayName}</span>}
              {s.venue ? <span><LuMapPin aria-hidden /> {s.venue}</span> : <span><LuYoutube aria-hidden /> YouTube Live</span>}
              {s.capacity ? <span><LuUsers aria-hidden /> {s.capacity} places</span> : null}
            </div>
            <div className="row" style={{ marginTop: 28 }}>
              {state === 'live' && !s.locked && <a href="#player" className="btn btn-gold">Join Live Session</a>}
              {state !== 'completed' && s.requiresRegistration && (
                <button type="button" className={`btn ${s.isRegistered ? 'btn-ghost-light' : 'btn-gold'}`} onClick={toggleRegistration} disabled={busy} aria-busy={busy}>
                  {busy && <span className="spinner" aria-hidden />} {s.isRegistered ? 'Cancel Registration' : 'Register for Free'}
                </button>
              )}
              {state === 'upcoming' && (
                <a className="btn btn-ghost-light" href={addToCalendarUrl(s)} target="_blank" rel="noopener noreferrer"><LuCalendarPlus /> Add to Calendar</a>
              )}
            </div>
          </div>
          <div id="player">
            {s.locked ? (
              <div className="yt yt-empty">
                <div>
                  <LuLock size={28} style={{ margin: '0 auto 10px' }} aria-hidden />
                  <p style={{ margin: '0 0 14px' }}>{s.accessLevel === 'enrolled' ? 'This session is for enrolled learners.' : 'Register to unlock the stream.'}</p>
                  {s.accessLevel === 'enrolled' && s.course && <Link className="btn btn-gold btn-sm" to={`/courses/${s.course.slug}`}>View Course</Link>}
                </div>
              </div>
            ) : (
              <YouTubePlayer videoId={videoId} title={s.title} live={state === 'live'} />
            )}
          </div>
        </div>
      </section>
      <section className="section-sm section-white">
        <div className="container container-narrow">
          <h2>About this {s.kind === 'event' ? 'event' : 'session'}</h2>
          <Markdown source={s.description} />
          {state === 'completed' && !s.recordingId && <p className="muted">The recording will be available here shortly.</p>}
        </div>
      </section>
    </>
  );
}
