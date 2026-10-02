import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  LuAward, LuBookOpen, LuCheck, LuChevronDown, LuCircleCheck, LuClock, LuGlobe, LuInfinity, LuLock, LuPlay, LuSignal, LuSmartphone,
} from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../services/api.js';
import { YouTubePlayer } from '../components/YouTubePlayer.jsx';
import { Modal } from '../components/Modal.jsx';
import { Loader, ErrorState } from '../components/States.jsx';
import { Progress } from '../components/Progress.jsx';
import { TrainerPhoto } from '../components/TrainerCard.jsx';
import { formatDuration, formatPrice, LEVEL_LABEL } from '../utils/format.js';
import { Markdown } from '../utils/markdown.jsx';

/** Group lessons by `section`, preserving order. */
export function groupBySection(lessons = []) {
  const map = new Map();
  lessons.forEach((l) => {
    const key = l.section || 'Lessons';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(l);
  });
  return [...map.entries()];
}

function Curriculum({ curriculum, courseSlug, canWatch, onPreview }) {
  const sections = useMemo(() => groupBySection(curriculum), [curriculum]);
  const [open, setOpen] = useState(() => new Set([0]));
  const toggle = (i) => setOpen((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  return (
    <div>
      {sections.map(([name, lessons], i) => (
        <div className="curriculum-section" key={name}>
          <button type="button" onClick={() => toggle(i)} aria-expanded={open.has(i)}>
            <span>{name}</span>
            <small>{lessons.length} lessons · {formatDuration(lessons.reduce((a, l) => a + (l.durationMinutes || 0), 0))} <LuChevronDown aria-hidden style={{ verticalAlign: 'middle', transform: open.has(i) ? 'rotate(180deg)' : 'none' }} /></small>
          </button>
          {open.has(i) && (
            <ul className="lesson-list">
              {lessons.map((l) => (
                <li key={l._id} className={`lesson-item${l.locked ? ' is-locked' : ''}`}>
                  {l.completed ? <LuCircleCheck className="li-icon" aria-label="Completed" /> : l.locked ? <LuLock className="li-icon" aria-label="Locked" /> : <LuPlay className="li-icon" aria-hidden />}
                  <span className="li-title">
                    {canWatch ? (
                      <Link to={`/learn/${courseSlug}/${l._id}`}>{l.title}</Link>
                    ) : !l.locked ? (
                      <button type="button" onClick={() => onPreview(l)}>{l.title}</button>
                    ) : (
                      l.title
                    )}
                  </span>
                  {l.isPreview && !canWatch && <span className="badge badge-gold">Preview</span>}
                  <span className="li-meta">{formatDuration(l.durationMinutes)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

export default function CourseDetails() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const { data, loading, error, reload } = useFetch(`/courses/${slug}`);
  const [preview, setPreview] = useState(null);
  const [enrolling, setEnrolling] = useState(false);

  const course = data?.course;
  useSeo({
    title: course?.seo?.metaTitle || course?.title,
    description: course?.seo?.metaDescription || course?.shortDescription,
    image: course?.coverImage,
  });

  if (loading && !data) return <Loader page label="Loading program…" />;
  if (error) return <div className="container section"><ErrorState error={error} onRetry={reload} /></div>;

  const { curriculum, access, enrollment } = data;
  const free = !course.price;
  const firstLesson = curriculum.find((l) => !l.locked);
  const resumeId = enrollment?.lastLesson || firstLesson?._id;

  const enroll = async () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/courses/${slug}` } });
      return;
    }
    if (!free) {
      navigate(`/checkout/${course.slug}`);
      return;
    }
    setEnrolling(true);
    try {
      await api.post('/enrollments', { courseId: course._id });
      toast.success('You are enrolled. Enjoy the journey.');
      navigate(`/learn/${course.slug}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setEnrolling(false);
    }
  };

  const enrollCta = access.isEnrolled ? (
    <Link to={`/learn/${course.slug}${resumeId ? `/${resumeId}` : ''}`} className="btn btn-block">Continue Learning</Link>
  ) : access.canWatch ? (
    <Link to={`/learn/${course.slug}`} className="btn btn-block">Open Course</Link>
  ) : (
    <button type="button" className="btn btn-block" onClick={enroll} disabled={enrolling} aria-busy={enrolling}>
      {enrolling && <span className="spinner" aria-hidden />} {free ? 'Enroll Now — Free' : 'Enroll Now'}
    </button>
  );

  return (
    <>
      <section className="course-hero">
        <div className="container course-hero-grid">
          <div>
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              <Link to="/courses">Programs</Link><span aria-hidden>/</span>
              {course.category && <><Link to={`/courses?category=${course.category.slug}`}>{course.category.name}</Link><span aria-hidden>/</span></>}
              <span aria-current="page">{course.title}</span>
            </nav>
            <h1>{course.title}</h1>
            <p className="lead" style={{ color: 'rgba(255,255,255,0.75)' }}>{course.shortDescription}</p>
            <div className="course-facts">
              <span><LuSignal aria-hidden /> {LEVEL_LABEL[course.level]}</span>
              <span><LuBookOpen aria-hidden /> {course.lessonCount} lessons</span>
              <span><LuClock aria-hidden /> {formatDuration(course.durationMinutes)}</span>
              <span><LuGlobe aria-hidden /> {course.language}</span>
            </div>
            {!!course.trainers?.length && (
              <p style={{ marginTop: 22 }}>
                Guided by{' '}
                {course.trainers.map((t, i) => (
                  <span key={t._id}>{i > 0 && ', '}<Link to={`/trainers/${t.slug}`} style={{ color: 'var(--gold)' }}>{t.displayName}</Link></span>
                ))}
              </p>
            )}
          </div>
          <YouTubePlayer videoId={course.previewVideo?.youtubeId} title={`${course.title} — preview`} />
        </div>
      </section>

      <section className="section-sm section-white">
        <div className="container course-body">
          <div className="stack" style={{ '--stack': '48px' }}>
            {!!course.outcomes?.length && (
              <div>
                <h2>What you will gain</h2>
                <ul className="outcomes">
                  {course.outcomes.map((o) => <li key={o}><LuCheck aria-hidden /> {o}</li>)}
                </ul>
              </div>
            )}
            <div>
              <h2>About this program</h2>
              <Markdown source={course.description} />
            </div>
            <div>
              <div className="row-between" style={{ marginBottom: 16 }}>
                <h2 style={{ margin: 0 }}>Curriculum</h2>
                <span className="muted small">{curriculum.length} lessons · {formatDuration(course.durationMinutes)}</span>
              </div>
              {curriculum.length ? (
                <Curriculum curriculum={curriculum} courseSlug={course.slug} canWatch={access.canWatch} onPreview={setPreview} />
              ) : (
                <p className="muted">Lessons are being prepared.</p>
              )}
            </div>
            {!!course.requirements?.length && (
              <div>
                <h2>Requirements</h2>
                <ul className="outcomes" style={{ gridTemplateColumns: '1fr' }}>
                  {course.requirements.map((r) => <li key={r}><LuCircleCheck aria-hidden /> {r}</li>)}
                </ul>
              </div>
            )}
            {course.trainers?.map((t) => (
              <div key={t._id} className="card card-pad" style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 24, alignItems: 'center' }}>
                <TrainerPhoto trainer={t} />
                <div>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>Your guide</div>
                  <h3 style={{ marginBottom: 4 }}>{t.displayName}</h3>
                  <p className="muted small" style={{ marginBottom: 8 }}>{t.title}</p>
                  <p style={{ margin: 0 }}>{t.shortBio}</p>
                </div>
              </div>
            ))}
          </div>

          <aside className="card card-pad enroll-card" aria-label="Enrollment">
            <div className={`price${free ? ' price-free' : ''}`}>
              {formatPrice(course.price, course.currency)}
              {!!course.compareAtPrice && course.compareAtPrice > course.price && <s>{formatPrice(course.compareAtPrice, course.currency)}</s>}
            </div>
            {enrollment && access.isEnrolled && <div style={{ margin: '18px 0' }}><Progress value={enrollment.progressPercent} /></div>}
            <div style={{ marginTop: 20 }}>{enrollCta}</div>
            <ul>
              <li><LuBookOpen aria-hidden /> {course.lessonCount} guided lessons</li>
              <li><LuInfinity aria-hidden /> Lifetime access</li>
              <li><LuSmartphone aria-hidden /> Learn on mobile & desktop</li>
              {course.certificateEnabled && <li><LuAward aria-hidden /> Certificate of completion</li>}
            </ul>
          </aside>
        </div>
      </section>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.title || 'Preview'} size="lg">
        {preview && <YouTubePlayer videoId={preview.youtubeId} title={preview.title} autoLoad autoplay />}
        {preview?.description && <p style={{ marginTop: 16 }}>{preview.description}</p>}
      </Modal>
    </>
  );
}
