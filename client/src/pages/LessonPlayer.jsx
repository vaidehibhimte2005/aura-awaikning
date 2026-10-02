import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { LuArrowLeft, LuArrowRight, LuAward, LuCircleCheck, LuDownload, LuFileText, LuLock, LuPlay } from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { api } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { YouTubePlayer } from '../components/YouTubePlayer.jsx';
import { Loader, ErrorState, EmptyState } from '../components/States.jsx';
import { Progress } from '../components/Progress.jsx';
import { Markdown } from '../utils/markdown.jsx';
import { formatDuration } from '../utils/format.js';
import { groupBySection } from './CourseDetails.jsx';

export default function LessonPlayer() {
  const { slug, lessonId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const course = useFetch(`/courses/${slug}`);
  const [tab, setTab] = useState('overview');
  const [saving, setSaving] = useState(false);

  const curriculum = course.data?.curriculum || [];
  const enrollment = course.data?.enrollment;
  const currentId = lessonId || enrollment?.lastLesson || curriculum.find((l) => !l.locked)?._id;
  const lesson = useFetch(currentId ? `/lessons/${currentId}` : null, undefined, { keepPrevious: false });

  useSeo({ title: lesson.data?.lesson?.title || course.data?.course?.title, noindex: true });
  useEffect(() => setTab('overview'), [currentId]);

  const index = curriculum.findIndex((l) => l._id === currentId);
  const prev = index > 0 ? curriculum[index - 1] : null;
  const next = index >= 0 && index < curriculum.length - 1 ? curriculum[index + 1] : null;
  const sections = useMemo(() => groupBySection(curriculum), [curriculum]);

  if (course.loading && !course.data) return <Loader page label="Opening your lesson…" />;
  if (course.error) return <div className="container section"><ErrorState error={course.error} onRetry={course.reload} /></div>;
  if (!course.data.access.canWatch) return <Navigate to={`/courses/${slug}`} replace />;
  if (!curriculum.length) return <div className="container section"><EmptyState title="Lessons are on their way" message="This program doesn't have published lessons yet." /></div>;
  if (!lessonId && currentId) return <Navigate to={`/learn/${slug}/${currentId}`} replace />;

  const current = curriculum[index];
  const l = lesson.data?.lesson;

  const toggleComplete = async () => {
    setSaving(true);
    const completed = !current?.completed;
    try {
      const { data } = await api.post('/progress', { lessonId: currentId, completed });
      course.setData((d) => ({
        ...d,
        enrollment: data.enrollment || d.enrollment,
        curriculum: d.curriculum.map((x) => (x._id === currentId ? { ...x, completed } : x)),
      }));
      if (data.certificate) toast.success('Course complete — your certificate is ready!');
      else if (completed) toast.success('Lesson marked complete');
      if (completed && next && !data.certificate) navigate(`/learn/${slug}/${next._id}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="player-layout">
      <div className="player-main">
        <Link to={`/courses/${slug}`} className="btn btn-text btn-sm"><LuArrowLeft /> {course.data.course.title}</Link>
        <div style={{ marginTop: 12 }}>
          {lesson.loading ? (
            <div className="yt skeleton" />
          ) : lesson.error ? (
            <ErrorState error={lesson.error} onRetry={lesson.reload} />
          ) : (
            <YouTubePlayer key={l?._id} videoId={l?.youtubeId} title={l?.title} start={lesson.data?.progress?.lastPositionSeconds || 0} />
          )}
        </div>

        <div className="player-toolbar">
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>{current?.section} · Lesson {index + 1} of {curriculum.length}</div>
            <h1 style={{ fontSize: 'clamp(1.7rem, 3vw, 2.4rem)', margin: 0 }}>{l?.title || current?.title}</h1>
          </div>
          <button type="button" className={`btn ${current?.completed ? 'btn-outline' : ''}`} onClick={toggleComplete} disabled={saving || !enrollment} aria-busy={saving} title={!enrollment ? 'Progress is tracked for enrolled learners' : undefined}>
            {saving ? <span className="spinner" aria-hidden /> : <LuCircleCheck />} {current?.completed ? 'Completed — Undo' : 'Mark as Complete'}
          </button>
        </div>

        <div className="row-between">
          {prev ? <Link className="btn btn-outline btn-sm" to={`/learn/${slug}/${prev._id}`}><LuArrowLeft /> Previous</Link> : <span />}
          {next ? <Link className="btn btn-outline btn-sm" to={`/learn/${slug}/${next._id}`}>Next Lesson <LuArrowRight /></Link> : <span />}
        </div>

        <div className="player-tabs" role="tablist">
          {['overview', 'notes', 'resources'].map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t === 'resources' ? `Resources (${l?.resources?.length || 0})` : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div role="tabpanel">
          {tab === 'overview' && (l?.description ? <Markdown source={l.description} /> : <p className="muted">No description for this lesson.</p>)}
          {tab === 'notes' && (l?.notes ? <Markdown source={l.notes} /> : <p className="muted">No notes for this lesson.</p>)}
          {tab === 'resources' && (l?.resources?.length ? (
            <ul className="resource-list">
              {l.resources.map((r) => (
                <li key={r._id || r.url}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                    {r.kind === 'pdf' || r.kind === 'document' ? <LuFileText aria-hidden /> : <LuDownload aria-hidden />}
                    <span style={{ flex: 1 }}>{r.title}</span>
                    <span className="badge">{r.kind}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : <p className="muted">No downloadable resources for this lesson.</p>)}
        </div>
      </div>

      <aside className="player-side" aria-label="Course content">
        <div className="player-side-head">
          <h2 style={{ fontSize: '1.4rem', marginBottom: 12 }}>Course content</h2>
          {enrollment ? <Progress value={enrollment.progressPercent} /> : <span className="badge">Preview access</span>}
          {enrollment?.status === 'completed' && (
            <Link to="/dashboard/certificates" className="btn btn-gold btn-sm btn-block" style={{ marginTop: 14 }}><LuAward /> View Certificate</Link>
          )}
        </div>
        {sections.map(([name, lessons]) => (
          <div key={name}>
            <div className="curriculum-title">{name}</div>
            <ul className="lesson-list" style={{ border: 0, background: 'transparent' }}>
              {lessons.map((x) => (
                <li key={x._id} className={`lesson-item${x.locked ? ' is-locked' : ''}`} aria-current={x._id === currentId ? 'true' : undefined}>
                  {x.completed ? <LuCircleCheck className="li-icon" aria-label="Completed" /> : x.locked ? <LuLock className="li-icon" aria-hidden /> : <LuPlay className="li-icon" aria-hidden />}
                  <span className="li-title">
                    {x.locked ? x.title : <Link to={`/learn/${slug}/${x._id}`}>{x.title}</Link>}
                  </span>
                  <span className="li-meta">{formatDuration(x.durationMinutes)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>
    </div>
  );
}
