import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuAward, LuBell, LuBookOpen, LuCircleCheck, LuCreditCard, LuExternalLink, LuPlay, LuRadio } from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../services/api.js';
import { CoverArt } from '../components/Brand.jsx';
import { Progress } from '../components/Progress.jsx';
import { LiveSessionCard } from '../components/LiveSessionCard.jsx';
import { AsyncBlock, EmptyState, Loader, ErrorState, Alert } from '../components/States.jsx';
import { Field, TextField } from '../components/Form.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { statusBadge } from '../panel/resources.jsx';
import { formatDate, formatDateTime, formatPrice, timeAgo } from '../utils/format.js';

function Cover({ course }) {
  return <div className="cover">{course.coverImage ? <img src={course.coverImage} alt="" /> : <CoverArt seed={course.slug} />}</div>;
}

function MyCourseCard({ enrollment }) {
  const c = enrollment.course;
  const resume = enrollment.lastLesson?._id || enrollment.lastLesson;
  return (
    <article className="card my-course">
      <Cover course={c} />
      <div className="my-course-body">
        <h3>{c.title}</h3>
        <Progress value={enrollment.progressPercent} />
        {enrollment.lastLesson?.title && <p className="small muted" style={{ margin: 0 }}>Last: {enrollment.lastLesson.title}</p>}
        <Link to={`/learn/${c.slug}${resume ? `/${resume}` : ''}`} className={`btn btn-sm ${enrollment.status === 'completed' ? 'btn-outline' : ''}`}>
          {enrollment.status === 'completed' ? 'Review Course' : enrollment.progressPercent ? 'Continue Learning' : 'Start Course'}
        </Link>
      </div>
    </article>
  );
}

export function LearnerOverview() {
  const { user } = useAuth();
  useSeo({ title: 'Dashboard', noindex: true });
  const { data, loading, error, reload } = useFetch('/dashboard/learner');
  if (loading && !data) return <Loader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const cont = data.continueLearning;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <div>
      <div className="panel-head">
        <div>
          <h1>{greet}, {user.name.split(' ')[0]}.</h1>
          <p>Take a breath. Here's where your practice stands.</p>
        </div>
        <Link to="/courses" className="btn btn-outline btn-sm">Explore Programs</Link>
      </div>
      <div className="stats">
        <div className="stat"><span className="stat-label">In progress <LuBookOpen /></span><span className="stat-value">{data.inProgress.length}</span></div>
        <div className="stat"><span className="stat-label">Completed <LuCircleCheck /></span><span className="stat-value">{data.completed.length}</span></div>
        <div className="stat"><span className="stat-label">Certificates <LuAward /></span><span className="stat-value">{data.certificateCount}</span></div>
        <div className="stat"><span className="stat-label">Unread <LuBell /></span><span className="stat-value">{data.unreadNotifications}</span></div>
      </div>

      {cont ? (
        <div className="continue-card">
          <Cover course={cont.course} />
          <div className="continue-card-body">
            <div className="eyebrow" style={{ marginBottom: 0 }}>Continue learning</div>
            <h2>{cont.course.title}</h2>
            {cont.lastLesson?.title && <p style={{ margin: 0 }}>Up next: {cont.lastLesson.title}</p>}
            <Progress value={cont.progressPercent} />
            <div><Link className="btn btn-gold btn-sm" to={`/learn/${cont.course.slug}${cont.lastLesson?._id ? `/${cont.lastLesson._id}` : ''}`}><LuPlay /> Continue Learning</Link></div>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 28 }}>
          <EmptyState icon={LuBookOpen} title="Begin your first program" message="Enroll in a free program to start your practice." action={<Link to="/courses?price=free" className="btn btn-sm">Browse Free Programs</Link>} />
        </div>
      )}

      <div className="panel-grid">
        <section className="panel-card">
          <div className="panel-card-head"><h2>My courses</h2><Link to="/dashboard/courses" className="btn btn-text btn-sm">View all</Link></div>
          <div className="panel-card-body">
            {[...data.inProgress, ...data.completed].slice(0, 4).map((e) => (
              <div className="list-row" key={e._id}>
                <div className="grow"><strong>{e.course.title}</strong><Progress value={e.progressPercent} label={false} /></div>
                <span className="small muted">{e.progressPercent}%</span>
              </div>
            ))}
            {!data.inProgress.length && !data.completed.length && <p className="muted" style={{ margin: 0 }}>No courses yet.</p>}
          </div>
        </section>
        <section className="panel-card">
          <div className="panel-card-head"><h2>Upcoming live</h2><Link to="/live-sessions" className="btn btn-text btn-sm">All</Link></div>
          <div className="panel-card-body">
            {data.upcomingSessions.length ? data.upcomingSessions.map((s) => (
              <div className="list-row" key={s._id}>
                <LuRadio aria-hidden style={{ color: 'var(--gold-700)' }} />
                <div className="grow"><strong>{s.title}</strong><span className="small muted">{formatDateTime(s.startAt)}</span></div>
                <Link to={`/live-sessions/${s.slug}`} className="btn btn-outline btn-sm">{s.state === 'live' ? 'Join Live' : 'View'}</Link>
              </div>
            )) : <p className="muted" style={{ margin: 0 }}>No sessions scheduled.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

export function MyCourses() {
  useSeo({ title: 'My Courses', noindex: true });
  const [tab, setTab] = useState('active');
  const { data, loading, error, reload } = useFetch('/enrollments/me');
  const list = (data || []).filter((e) => e.status === tab);
  return (
    <div>
      <div className="panel-head"><div><h1>My courses</h1><p>Everything you're enrolled in, on every device.</p></div></div>
      <div className="player-tabs" role="tablist" style={{ marginTop: 0 }}>
        <button type="button" role="tab" aria-selected={tab === 'active'} onClick={() => setTab('active')}>In progress</button>
        <button type="button" role="tab" aria-selected={tab === 'completed'} onClick={() => setTab('completed')}>Completed</button>
      </div>
      <AsyncBlock loading={loading && !data} error={error} onRetry={reload} empty={!list.length}
        emptyState={<EmptyState icon={LuBookOpen} title={tab === 'active' ? 'No courses in progress' : 'No completed courses yet'} action={<Link to="/courses" className="btn btn-sm">Browse Programs</Link>} />}>
        <div className="grid grid-3">{list.map((e) => <MyCourseCard key={e._id} enrollment={e} />)}</div>
      </AsyncBlock>
    </div>
  );
}

export function MySessions() {
  useSeo({ title: 'Live Sessions', noindex: true });
  const { data, loading, error, reload } = useFetch('/live-sessions', { state: 'current', limit: 20 });
  return (
    <div>
      <div className="panel-head"><div><h1>Live sessions</h1><p>Join live on YouTube or register for upcoming circles.</p></div><Link to="/live-sessions" className="btn btn-outline btn-sm">Recordings</Link></div>
      <AsyncBlock loading={loading && !data} error={error} onRetry={reload} empty={!data?.length} emptyState={<EmptyState icon={LuRadio} title="Nothing scheduled" message="New sessions are added weekly." />}>
        {data?.map((s) => <LiveSessionCard key={s._id} session={s} />)}
      </AsyncBlock>
    </div>
  );
}

export function MyCertificates() {
  useSeo({ title: 'Certificates', noindex: true });
  const { data, loading, error, reload } = useFetch('/certificates/me');
  return (
    <div>
      <div className="panel-head"><div><h1>Certificates</h1><p>Complete every lesson in a program to receive a verifiable certificate.</p></div></div>
      <AsyncBlock loading={loading && !data} error={error} onRetry={reload} empty={!data?.length} emptyState={<EmptyState icon={LuAward} title="No certificates yet" message="Finish a program and your certificate will appear here." />}>
        <div className="grid grid-3">
          {data?.map((c) => (
            <article key={c._id} className="card card-pad">
              <LuAward size={28} style={{ color: 'var(--gold-700)' }} aria-hidden />
              <h3 style={{ marginTop: 12 }}>{c.courseTitle}</h3>
              <p className="small muted">Completed {formatDate(c.completedAt)}<br />No. {c.certificateNumber}</p>
              <Link to={`/certificates/${c.certificateNumber}`} className="btn btn-outline btn-sm">View Certificate</Link>
            </article>
          ))}
        </div>
      </AsyncBlock>
    </div>
  );
}

export function MyPayments() {
  useSeo({ title: 'Payments', noindex: true });
  const { data, loading, error, reload } = useFetch('/payments/me');
  return (
    <div>
      <div className="panel-head"><div><h1>Payment history</h1><p>Receipts for your program purchases.</p></div></div>
      <AsyncBlock loading={loading && !data} error={error} onRetry={reload} empty={!data?.length} emptyState={<EmptyState icon={LuCreditCard} title="No payments yet" message="Free programs don't appear here." />}>
        <div className="table-wrap">
          <table className="table table-responsive">
            <thead><tr><th>Date</th><th>Program</th><th>Order</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {data?.map((p) => (
                <tr key={p._id}>
                  <td data-label="Date">{formatDate(p.createdAt)}</td>
                  <td data-label="Program">{p.course ? <Link to={`/courses/${p.course.slug}`}>{p.course.title}</Link> : '—'}</td>
                  <td data-label="Order"><code>{p.order?.orderNumber}</code></td>
                  <td data-label="Amount">{formatPrice(p.amount, p.currency)}</td>
                  <td data-label="Status">{statusBadge(p.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AsyncBlock>
    </div>
  );
}

export function Notifications() {
  useSeo({ title: 'Notifications', noindex: true });
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload, setData } = useFetch('/notifications', { page, limit: 20 });
  const markAll = async () => {
    await api.patch('/notifications/all/read');
    setData((d) => d.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
  };
  const markOne = (n) => { if (!n.readAt) api.patch(`/notifications/${n._id}/read`).catch(() => {}); };
  return (
    <div>
      <div className="panel-head">
        <div><h1>Notifications</h1><p>{meta?.unread ? `${meta.unread} unread` : 'You are all caught up.'}</p></div>
        {!!meta?.unread && <button type="button" className="btn btn-outline btn-sm" onClick={markAll}>Mark All as Read</button>}
      </div>
      <AsyncBlock loading={loading && !data} error={error} onRetry={reload} empty={!data?.length} emptyState={<EmptyState icon={LuBell} title="No notifications" />}>
        <div className="panel-card">
          {data?.map((n) => {
            const Tag = n.link ? Link : 'div';
            return (
              <Tag key={n._id} to={n.link || undefined} className={`notif${n.readAt ? '' : ' unread'}`} onClick={() => markOne(n)}>
                <span className="notif-icon" aria-hidden><LuBell size={16} /></span>
                <div style={{ flex: 1 }}><strong>{n.title}</strong><span className="small muted">{n.message}</span></div>
                <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{timeAgo(n.createdAt)}</span>
                {n.link && <LuExternalLink size={14} aria-hidden style={{ color: 'var(--muted)' }} />}
              </Tag>
            );
          })}
        </div>
      </AsyncBlock>
      {meta && <Pagination page={meta.page} pages={meta.pages} onChange={setPage} />}
    </div>
  );
}

export function Profile() {
  useSeo({ title: 'Profile', noindex: true });
  const { user, updateUser, applySession } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ name: user.name, phone: user.phone || '', bio: user.bio || '', notificationPrefs: { email: true, sms: false, whatsapp: false, push: true, ...user.notificationPrefs } });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const { data } = await api.patch('/auth/me', form);
      updateUser(data.user);
      toast.success('Profile updated');
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };
  const changePw = async (e) => {
    e.preventDefault();
    setPwErr('');
    if (pw.newPassword !== pw.confirmPassword) return setPwErr('Passwords do not match');
    setPwBusy(true);
    try {
      const { data } = await api.post('/auth/change-password', pw);
      applySession(data);
      setPw({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password changed. Other devices have been signed out.');
    } catch (ex) { setPwErr(ex.message); } finally { setPwBusy(false); }
    return null;
  };
  const pref = (k) => (e) => setForm((f) => ({ ...f, notificationPrefs: { ...f.notificationPrefs, [k]: e.target.checked } }));

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="panel-head"><div><h1>Profile</h1><p>Your account is shared across web and mobile.</p></div></div>
      <form className="panel-card panel-card-body" onSubmit={save} noValidate>
        {err && <div style={{ marginBottom: 16 }}><Alert>{err}</Alert></div>}
        <div className="field-row">
          <TextField label="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField label="Email" value={user.email} disabled hint="Contact support to change your email" />
        </div>
        <div style={{ marginTop: 18 }}><TextField label="Mobile number" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} hint="Used for SMS/WhatsApp reminders if enabled" /></div>
        <div style={{ marginTop: 18 }}><TextField label="About you" multiline rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
        <div style={{ marginTop: 18 }}>
          <Field label="Notifications">
            {() => (
              <div className="row" style={{ gap: 20 }}>
                {['email', 'sms', 'whatsapp', 'push'].map((k) => (
                  <label key={k} className="checkbox"><input type="checkbox" checked={!!form.notificationPrefs[k]} onChange={pref(k)} /> {k === 'sms' ? 'SMS' : k[0].toUpperCase() + k.slice(1)}</label>
                ))}
              </div>
            )}
          </Field>
        </div>
        <button type="submit" className="btn" style={{ marginTop: 24 }} disabled={busy}>{busy && <span className="spinner" aria-hidden />} Save Changes</button>
      </form>

      <form className="panel-card panel-card-body" style={{ marginTop: 24 }} onSubmit={changePw} noValidate>
        <h2 style={{ fontSize: '1.4rem' }}>Change password</h2>
        {pwErr && <div style={{ marginBottom: 16 }}><Alert>{pwErr}</Alert></div>}
        <TextField label="Current password" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
        <div className="field-row" style={{ marginTop: 18 }}>
          <TextField label="New password" type="password" autoComplete="new-password" hint="8+ characters, a letter and a number" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          <TextField label="Confirm new password" type="password" autoComplete="new-password" value={pw.confirmPassword} onChange={(e) => setPw({ ...pw, confirmPassword: e.target.value })} />
        </div>
        <button type="submit" className="btn btn-outline" style={{ marginTop: 24 }} disabled={pwBusy}>{pwBusy && <span className="spinner" aria-hidden />} Update Password</button>
      </form>
    </div>
  );
}
