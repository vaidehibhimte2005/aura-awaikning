/**
 * Management screens. Most are thin configurations of <ResourceManager />,
 * reused by the Admin, Content & Live Manager and Trainer panels.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuBookOpen, LuCalendarDays, LuCheck, LuX, LuCreditCard, LuEye, LuGraduationCap, LuIndianRupee, LuRotateCcw, LuUserCheck, LuUserPlus, LuUsers } from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../services/api.js';
import { ResourceManager } from '../panel/ResourceManager.jsx';
import { FormFields, initialValues, cleanPayload } from '../panel/FormBuilder.jsx';
import { ConfirmDialog, Modal } from '../components/Modal.jsx';
import { ErrorState, Loader, Alert, EmptyState } from '../components/States.jsx';
import { Progress } from '../components/Progress.jsx';
import { WorkflowStats } from './WorkflowStats.jsx';
import * as R from '../panel/resources.jsx';
import { formatDate, formatDateTime, formatPrice, titleCase } from '../utils/format.js';

const sumRevenue = (rows = []) => rows.map((r) => formatPrice(r.total ?? r.revenue, r._id)).join(' · ') || formatPrice(0);

// ─── Dashboards ───────────────────────────────────────────
export function AdminDashboard() {
  useSeo({ title: 'Admin', noindex: true });
  const { data, loading, error, reload } = useFetch('/dashboard/admin');
  if (loading && !data) return <Loader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const t = data.totals;
  const max = Math.max(1, ...data.signupsByDay.map((d) => d.count));
  return (
    <div>
      <div className="panel-head"><div><h1>Dashboard</h1><p>An overview of Aura Awakening today.</p></div><Link to="/admin/courses" className="btn btn-sm">Manage Courses</Link></div>
      <div className="stats">
        <div className="stat"><span className="stat-label">Total users <LuUsers /></span><span className="stat-value">{t.totalUsers}</span></div>
        <div className="stat"><span className="stat-label">Active learners <LuUserCheck /></span><span className="stat-value">{t.activeLearners}</span><span className="stat-sub">Last 30 days</span></div>
        <div className="stat"><span className="stat-label">Trainers <LuGraduationCap /></span><span className="stat-value">{t.trainers}</span></div>
        <div className="stat"><span className="stat-label">Courses <LuBookOpen /></span><span className="stat-value">{t.courses}</span></div>
        <div className="stat"><span className="stat-label">Enrollments <LuUserPlus /></span><span className="stat-value">{t.enrollments}</span></div>
        <div className="stat"><span className="stat-label">Revenue <LuIndianRupee /></span><span className="stat-value" style={{ fontSize: '1.7rem' }}>{sumRevenue(data.revenue)}</span><span className="stat-sub">30 days: {sumRevenue(data.revenue30)}</span></div>
      </div>
      <WorkflowStats workflow={data.workflow} base="admin" />
      <div className="panel-grid">
        <section className="panel-card">
          <div className="panel-card-head"><h2>Recent payments</h2><Link to="/admin/payments" className="btn btn-text btn-sm">View all</Link></div>
          <div className="panel-card-body">
            {data.recentPayments.length ? data.recentPayments.map((p) => (
              <div className="list-row" key={p._id}>
                <LuCreditCard aria-hidden style={{ color: 'var(--gold-700)' }} />
                <div className="grow"><strong>{p.user?.name || 'Unknown'} — {p.course?.title}</strong><span className="small muted">{formatDateTime(p.createdAt)}</span></div>
                <span>{formatPrice(p.amount, p.currency)}</span>
                {R.statusBadge(p.status)}
              </div>
            )) : <p className="muted" style={{ margin: 0 }}>No payments yet.</p>}
          </div>
        </section>
        <div className="stack" style={{ '--stack': '20px' }}>
          <section className="panel-card">
            <div className="panel-card-head"><h2>Upcoming sessions</h2><Link to="/admin/live-sessions" className="btn btn-text btn-sm">Manage</Link></div>
            <div className="panel-card-body">
              {data.upcomingSessions.length ? data.upcomingSessions.map((s) => (
                <div className="list-row" key={s._id}>
                  <LuCalendarDays aria-hidden style={{ color: 'var(--gold-700)' }} />
                  <div className="grow"><strong>{s.title}</strong><span className="small muted">{formatDateTime(s.startAt)} · {s.trainer?.displayName}</span></div>
                </div>
              )) : <p className="muted" style={{ margin: 0 }}>Nothing scheduled.</p>}
            </div>
          </section>
          <section className="panel-card">
            <div className="panel-card-head"><h2>New sign-ups</h2><span className="small muted">30 days</span></div>
            <div className="panel-card-body">
              {data.signupsByDay.length ? (
                <div className="bar-chart" role="img" aria-label="Daily sign-ups over the last 30 days">
                  {data.signupsByDay.map((d) => <span key={d._id} style={{ height: `${(d.count / max) * 100}%` }} title={`${d._id}: ${d.count}`} />)}
                </div>
              ) : <p className="muted" style={{ margin: 0 }}>No sign-ups yet.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function TrainerDashboard() {
  useSeo({ title: 'Trainer Studio', noindex: true });
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch('/dashboard/trainer');
  if (loading && !data) return <Loader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data.hasProfile) return <EmptyState title="Your trainer profile is being set up" message="An administrator needs to link a trainer profile to your account before you can manage courses." />;
  return (
    <div>
      <div className="panel-head"><div><h1>Welcome, {user.name.split(' ')[0]}</h1><p>Your courses, sessions and learners.</p></div><Link to="/trainer/live-sessions" className="btn btn-sm">Schedule a Session</Link></div>
      <div className="stats">
        <div className="stat"><span className="stat-label">Total courses <LuBookOpen /></span><span className="stat-value">{data.counts.total}</span></div>
        <div className="stat"><span className="stat-label">Published</span><span className="stat-value">{data.counts.published}</span></div>
        <div className="stat"><span className="stat-label">Pending approval</span><span className="stat-value">{data.counts.pendingApproval}</span></div>
        <div className="stat"><span className="stat-label">Rejected / changes requested</span><span className="stat-value">{data.counts.rejected}</span></div>
        <div className="stat"><span className="stat-label">Learners <LuUsers /></span><span className="stat-value">{data.learnerCount}</span></div>
        <div className="stat"><span className="stat-label">Revenue <LuIndianRupee /></span><span className="stat-value" style={{ fontSize: '1.7rem' }}>{data.revenue.length ? sumRevenue(data.revenue) : formatPrice(0)}</span><span className="stat-sub">Verified paid orders</span></div>
        <div className="stat"><span className="stat-label">Avg. progress</span><span className="stat-value">{data.averageProgress}%</span></div>
        <div className="stat"><span className="stat-label">Upcoming sessions <LuCalendarDays /></span><span className="stat-value">{data.sessions.length}</span></div>
      </div>
      <div className="panel-grid">
        <section className="panel-card">
          <div className="panel-card-head"><h2>My courses</h2><Link to="/trainer/courses" className="btn btn-text btn-sm">Manage</Link></div>
          <div className="panel-card-body">
            {data.courses.length ? data.courses.map((c) => (
              <div className="list-row" key={c._id}>
                <div className="grow"><strong>{c.title}</strong><span className="small muted">{c.lessonCount} lessons · {c.enrollmentCount} learners{c.reviewNote && ['rejected', 'needs_revision'].includes(c.status) ? ` · ${c.reviewNote}` : ''}</span></div>
                {R.statusBadge(c.status)}
                <Link to={`/trainer/courses/${c._id}/curriculum`} className="btn btn-outline btn-sm">Curriculum</Link>
              </div>
            )) : <p className="muted" style={{ margin: 0 }}>No courses assigned yet.</p>}
          </div>
        </section>
        <section className="panel-card">
          <div className="panel-card-head"><h2>Recent notifications</h2><Link to="/trainer/notifications" className="btn btn-text btn-sm">View all</Link></div>
          <div className="panel-card-body">
            {data.recentNotifications?.length ? data.recentNotifications.map((n) => (
              <div className="list-row" key={n._id}><div className="grow"><strong>{n.title}</strong><span className="small muted">{n.message}</span></div></div>
            )) : <p className="muted" style={{ margin: 0 }}>Nothing new.</p>}
          </div>
        </section>
        <section className="panel-card">
          <div className="panel-card-head"><h2>Next sessions</h2></div>
          <div className="panel-card-body">
            {data.sessions.length ? data.sessions.map((s) => (
              <div className="list-row" key={s._id}><div className="grow"><strong>{s.title}</strong><span className="small muted">{formatDateTime(s.startAt)}</span></div></div>
            )) : <p className="muted" style={{ margin: 0 }}>Nothing scheduled.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

export function ManagerDashboard() {
  useSeo({ title: 'Content & Live', noindex: true });
  const { data, loading, error, reload } = useFetch('/dashboard/manager');
  if (loading && !data) return <Loader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div>
      <div className="panel-head"><div><h1>Content & Live</h1><p>Keep the website fresh and the live calendar full.</p></div><Link to="/manager/content" className="btn btn-sm">Edit Homepage</Link></div>
      <WorkflowStats workflow={data.workflow} base="manager" />
      <div className="stats">
        <div className="stat"><span className="stat-label">Published articles</span><span className="stat-value">{data.articles}</span></div>
        <div className="stat"><span className="stat-label">Drafts</span><span className="stat-value">{data.drafts}</span></div>
        <div className="stat"><span className="stat-label">Upcoming sessions</span><span className="stat-value">{data.upcomingSessions}</span></div>
      </div>
      <section className="panel-card">
        <div className="panel-card-head"><h2>Live calendar</h2><Link to="/manager/live-sessions" className="btn btn-text btn-sm">Manage</Link></div>
        <div className="panel-card-body">
          {data.sessions.length ? data.sessions.map((s) => (
            <div className="list-row" key={s._id}><div className="grow"><strong>{s.title}</strong><span className="small muted">{formatDateTime(s.startAt)} · {s.trainer?.displayName || '—'}</span></div>{s.isPublished ? <span className="badge badge-success">Published</span> : <span className="badge badge-warning">Draft</span>}</div>
          )) : <p className="muted" style={{ margin: 0 }}>Nothing scheduled.</p>}
        </div>
      </section>
    </div>
  );
}

// ─── Courses / sessions (role-aware) ──────────────────────
export function CoursesScreen({ base }) {
  const { user } = useAuth();
  const toast = useToast();
  const role = user.role;
  useSeo({ title: 'Courses', noindex: true });
  return (
    <ResourceManager
      title={base === 'manager' ? 'Course presentation' : base === 'trainer' ? 'My courses' : 'Courses'}
      description={base === 'manager' ? 'Edit descriptions, imagery, preview videos and SEO. Approvals live under Course Approvals.' : base === 'trainer' ? 'Create courses, then submit them for manager approval. Approved courses can be published to the marketplace.' : 'Create, price, publish and assign trainers to courses.'}
      endpoint="/courses"
      params={{ scope: 'manage' }}
      entity="course"
      fields={R.courseFields(role)}
      columns={R.courseColumns(base)}
      filters={[{ name: 'status', label: 'Status', options: [{ value: 'draft', label: 'Draft' }, { value: 'pending_approval', label: 'Pending approval' }, { value: 'under_review', label: 'Under review' }, { value: 'needs_revision', label: 'Needs revision' }, { value: 'approved', label: 'Approved' }, { value: 'published', label: 'Published' }, { value: 'rejected', label: 'Rejected' }, { value: 'archived', label: 'Archived' }] }]}
      canCreate={base !== 'manager'}
      onSaved={(c) => c?.pulledBack && toast.success('Changes saved. Because this course was already reviewed, it is back to Draft — submit it again for approval.')}
      canDelete={base === 'admin'}
      rowActions={R.courseRowActions(base)}
      deleteMessage="Courses with enrolled learners are archived instead of deleted, so learners keep their history."
    />
  );
}

export function SessionsScreen({ base, kind = 'session' }) {
  const { user } = useAuth();
  const toast = useToast();
  const canReview = user.role === 'admin' || user.role === 'manager';
  const review = async (s, decision, reload) => {
    let reason = '';
    if (decision === 'reject') {
      reason = window.prompt('Reason for rejecting (shown to the trainer):', '');
      if (reason === null) return;
    }
    try {
      await api.patch(`/live-sessions/${s._id}/review`, { decision, reason });
      toast.success(decision === 'approve' ? 'Approved — now visible to learners' : 'Rejected');
      reload();
    } catch (e) { toast.error(e.message); }
  };
  useSeo({ title: kind === 'event' ? 'Events' : 'Live Sessions', noindex: true });
  return (
    <ResourceManager
      title={kind === 'event' ? 'Events' : 'Live sessions'}
      description={kind === 'event' ? 'Workshops, retreats and gatherings.' : 'Schedule YouTube Live sessions, go live and attach recordings.'}
      endpoint="/live-sessions"
      params={{ scope: 'manage', kind }}
      entity={kind === 'event' ? 'event' : 'session'}
      createLabel={kind === 'event' ? 'Create Event' : 'Schedule Session'}
      fields={R.sessionFields(user.role, kind)}
      columns={R.sessionColumns}
      filters={canReview ? [{ name: 'approvalStatus', label: 'Approval', options: [{ value: 'pending', label: 'Pending approval' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }] }] : []}
      rowActions={(s, { reload }) => (
        <>
          {canReview && s.approvalStatus !== 'approved' && (
            <button type="button" className="icon-btn" title="Approve" aria-label="Approve" onClick={() => review(s, 'approve', reload)}><LuCheck /></button>
          )}
          {canReview && s.approvalStatus === 'pending' && (
            <button type="button" className="icon-btn" title="Reject" aria-label="Reject" onClick={() => review(s, 'reject', reload)}><LuX /></button>
          )}
          <Link to={`/${s.kind === 'event' ? 'events' : 'live-sessions'}/${s.slug}`} className="icon-btn" target="_blank" aria-label="View"><LuEye /></Link>
        </>
      )}
      searchable={false}
      emptyMessage={base === 'trainer' ? 'Schedule your first live session.' : undefined}
    />
  );
}

// ─── Simple content screens ───────────────────────────────
export const ArticlesScreen = () => <ResourceManager title="Articles" description="Journal posts and resources." endpoint="/articles" entity="article" fields={R.articleFields} columns={R.articleColumns} filters={[{ name: 'status', label: 'Status', options: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }] }]} rowActions={(a) => <Link to={`/articles/${a.slug}`} className="icon-btn" target="_blank" aria-label="View"><LuEye /></Link>} />;
export const FaqsScreen = () => <ResourceManager title="FAQs" endpoint="/faqs" entity="FAQ" createLabel="Add FAQ" fields={R.faqFields} columns={R.faqColumns} modalSize="" />;
export const TestimonialsScreen = () => <ResourceManager title="Testimonials" description="Shown on the homepage." endpoint="/testimonials" entity="testimonial" createLabel="Add Testimonial" fields={R.testimonialFields} columns={R.testimonialColumns} modalSize="" />;
export const AnnouncementsScreen = () => <ResourceManager title="Announcements" description="Site banners and in-app notifications." endpoint="/announcements" entity="announcement" fields={R.announcementFields} columns={R.announcementColumns} />;
export const CategoriesScreen = () => <ResourceManager title="Categories" endpoint="/categories" entity="category" createLabel="Create Category" fields={R.categoryFields} columns={R.categoryColumns} modalSize="sm" deleteMessage="Courses in this category will become uncategorised." />;

export function MessagesScreen() {
  const toast = useToast();
  const [viewing, setViewing] = useState(null);
  const setStatus = async (m, status, reload) => {
    try { await api.patch(`/contact/${m._id}`, { status }); reload(); } catch (e) { toast.error(e.message); }
  };
  return (
    <>
      <ResourceManager
        title="Messages"
        description="Contact form submissions."
        endpoint="/contact"
        entity="message"
        columns={[
          { key: 'name', label: 'From', render: (m) => <div><div className="cell-title">{m.name}</div><div className="cell-sub">{m.email}</div></div> },
          { key: 'subject', label: 'Subject', render: (m) => m.subject || m.message.slice(0, 50) },
          { key: 'status', label: 'Status', render: (m) => R.statusBadge(m.status) },
          { key: 'createdAt', label: 'Received', render: (m) => formatDateTime(m.createdAt) },
        ]}
        filters={[{ name: 'status', label: 'Status', options: ['new', 'read', 'replied', 'archived'].map((s) => ({ value: s, label: titleCase(s) })) }]}
        canCreate={false}
        canDelete={false}
        rowActions={(m, { reload }) => (
          <button type="button" className="icon-btn" aria-label="Open message" onClick={() => { setViewing(m); if (m.status === 'new') setStatus(m, 'read', reload); }}><LuEye /></button>
        )}
      />
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.subject || 'Message'} footer={viewing && <a className="btn btn-sm" href={`mailto:${viewing.email}?subject=Re: ${encodeURIComponent(viewing.subject || 'Your message')}`}>Reply by Email</a>}>
        {viewing && <><p className="small muted">{viewing.name} · {viewing.email} {viewing.phone && `· ${viewing.phone}`} · {formatDateTime(viewing.createdAt)}</p><p style={{ whiteSpace: 'pre-wrap' }}>{viewing.message}</p></>}
      </Modal>
    </>
  );
}

// ─── People ───────────────────────────────────────────────
export function UsersScreen({ role, title = 'Users' }) {
  const { user: me } = useAuth();
  return (
    <ResourceManager
      title={title}
      description={role === 'manager' ? 'Content & Live Managers can edit website content and live sessions, but not users, payments or settings.' : 'Every account works across web and mobile — one user database.'}
      endpoint="/users"
      params={role ? { role } : {}}
      entity="user"
      createLabel={role === 'manager' ? 'Add Manager' : 'Add User'}
      fields={role ? R.userFields.map((f) => (f.name === 'role' ? { ...f, default: role } : f)) : R.userFields}
      columns={R.userColumns}
      filters={role ? [] : [{ name: 'role', label: 'Role', options: R.ROLE_OPTIONS }, { name: 'isActive', label: 'Status', options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Disabled' }] }]}
      canDelete={(u) => u._id !== me._id && u.isActive}
      deleteMessage="The account will be deactivated (not erased) so orders, payments and certificates stay intact."
      modalSize=""
    />
  );
}

export const TrainersScreen = () => (
  <ResourceManager
    title="Trainers"
    description="Public trainer profiles and their logins."
    endpoint="/trainers"
    params={{ all: 'true' }}
    entity="trainer"
    createLabel="Add Trainer"
    fields={(item) => R.trainerFields(item === 'new')}
    columns={R.trainerColumns}
    rowActions={(t) => <Link to={`/trainers/${t.slug}`} className="icon-btn" target="_blank" aria-label="View profile"><LuEye /></Link>}
    deleteMessage="Trainers assigned to courses cannot be deleted — unpublish them instead."
  />
);

export function TrainerProfileScreen() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch('/trainers/me/profile');
  const fields = R.trainerFields(false).filter((f) => !['order', 'isPublished'].includes(f.name));
  const [values, setValues] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (loading && !data) return <Loader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const v = values || initialValues(fields, data);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.patch(`/trainers/${data._id}`, cleanPayload(fields, v));
      toast.success('Profile saved');
      reload();
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };
  return (
    <div style={{ maxWidth: 820 }}>
      <div className="panel-head"><div><h1>Public profile</h1><p>How you appear on the Trainers page.</p></div><Link className="btn btn-outline btn-sm" to={`/trainers/${data.slug}`} target="_blank"><LuEye /> View</Link></div>
      <form className="panel-card panel-card-body" onSubmit={save} noValidate>
        {err && <div style={{ marginBottom: 16 }}><Alert>{err}</Alert></div>}
        <FormFields fields={fields} values={v} onChange={setValues} />
        <button type="submit" className="btn" disabled={busy}>{busy && <span className="spinner" aria-hidden />} Save Changes</button>
      </form>
    </div>
  );
}

export function TrainerLearners() {
  return (
    <ResourceManager
      title="Learners"
      description="Learners enrolled in your courses."
      endpoint="/trainers/me/learners"
      entity="learner"
      searchable={false}
      canCreate={false}
      canEdit={false}
      canDelete={false}
      columns={[
        { key: 'user', label: 'Learner', render: (e) => <div><div className="cell-title">{e.user?.name}</div><div className="cell-sub">{e.user?.email}</div></div> },
        { key: 'course', label: 'Course', render: (e) => e.course?.title },
        { key: 'progress', label: 'Progress', render: (e) => <div style={{ minWidth: 140 }}><Progress value={e.progressPercent} label={false} /><span className="cell-sub">{e.progressPercent}%</span></div> },
        { key: 'createdAt', label: 'Enrolled', render: (e) => formatDate(e.createdAt) },
      ]}
    />
  );
}

// ─── Commerce ─────────────────────────────────────────────
export function PaymentsScreen() {
  const toast = useToast();
  const [refund, setRefund] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reloadFn, setReloadFn] = useState(null);
  const doRefund = async () => {
    setBusy(true);
    try {
      await api.post(`/payments/${refund._id}/refund`);
      toast.success('Refund processed and enrollment revoked');
      setRefund(null);
      reloadFn?.();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <ResourceManager
        title="Payments"
        description="Every transaction is verified server-side with the payment provider."
        endpoint="/payments"
        entity="payment"
        canCreate={false}
        canEdit={false}
        canDelete={false}
        filters={[{ name: 'status', label: 'Status', options: ['created', 'pending', 'paid', 'failed', 'refunded'].map((s) => ({ value: s, label: titleCase(s) })) }, { name: 'provider', label: 'Provider', options: ['razorpay', 'stripe', 'mock'].map((s) => ({ value: s, label: titleCase(s) })) }]}
        columns={[
          { key: 'user', label: 'Learner', render: (p) => <div><div className="cell-title">{p.user?.name}</div><div className="cell-sub">{p.user?.email}</div></div> },
          { key: 'course', label: 'Course', render: (p) => p.course?.title },
          { key: 'amount', label: 'Amount', render: (p) => formatPrice(p.amount, p.currency) },
          { key: 'provider', label: 'Provider', render: (p) => <div><div>{titleCase(p.provider)}</div><div className="cell-sub"><code>{p.transactionId || p.providerOrderId}</code></div></div> },
          { key: 'status', label: 'Status', render: (p) => R.statusBadge(p.status) },
          { key: 'createdAt', label: 'Date', render: (p) => formatDateTime(p.paidAt || p.createdAt) },
        ]}
        rowActions={(p, { reload }) => p.status === 'paid' && (
          <button type="button" className="icon-btn" title="Refund" aria-label="Refund payment" onClick={() => { setRefund(p); setReloadFn(() => reload); }}><LuRotateCcw /></button>
        )}
      />
      <ConfirmDialog open={!!refund} danger busy={busy} title="Refund this payment?" message={refund && `${formatPrice(refund.amount, refund.currency)} will be refunded through ${titleCase(refund.provider)} and the learner's access to “${refund.course?.title}” will be revoked.`} confirmLabel="Refund Payment" onConfirm={doRefund} onCancel={() => setRefund(null)} />
    </>
  );
}

export const OrdersScreen = () => (
  <ResourceManager
    title="Orders"
    endpoint="/orders"
    entity="order"
    canCreate={false}
    canEdit={false}
    canDelete={false}
    filters={[{ name: 'status', label: 'Status', options: ['created', 'pending', 'paid', 'failed', 'refunded', 'cancelled'].map((s) => ({ value: s, label: titleCase(s) })) }]}
    columns={[
      { key: 'orderNumber', label: 'Order', render: (o) => <code>{o.orderNumber}</code> },
      { key: 'user', label: 'Learner', render: (o) => o.user?.email },
      { key: 'course', label: 'Course', render: (o) => o.course?.title },
      { key: 'amount', label: 'Amount', render: (o) => formatPrice(o.amount, o.currency) },
      { key: 'status', label: 'Status', render: (o) => R.statusBadge(o.status) },
      { key: 'createdAt', label: 'Created', render: (o) => formatDateTime(o.createdAt) },
    ]}
  />
);

export function EnrollmentsScreen() {
  const toast = useToast();
  const [grant, setGrant] = useState(false);
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);
  const grantFields = [
    { name: 'userId', label: 'Learner', type: 'select', required: true, optionsFrom: { endpoint: '/users', params: { role: 'learner' }, label: (u) => `${u.name} (${u.email})` } },
    { name: 'courseId', label: 'Course', type: 'select', required: true, optionsFrom: { endpoint: '/courses', params: { scope: 'manage' }, labelKey: 'title' } },
  ];
  const submitGrant = async () => {
    setBusy(true);
    try { await api.post('/enrollments/grant', values); toast.success('Access granted'); setGrant(false); setKey((k) => k + 1); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const setStatus = async (e, status, reload) => {
    try { await api.patch(`/enrollments/${e._id}`, { status }); toast.success('Enrollment updated'); reload(); } catch (ex) { toast.error(ex.message); }
  };
  return (
    <>
      <ResourceManager
        key={key}
        title="Enrollments"
        description="Grant complimentary access or revoke enrollments."
        endpoint="/enrollments"
        entity="enrollment"
        searchable={false}
        canCreate={false}
        canEdit={false}
        canDelete={false}
        headerActions={<button type="button" className="btn" onClick={() => { setValues(initialValues(grantFields)); setGrant(true); }}><LuUserPlus /> Grant Access</button>}
        filters={[{ name: 'status', label: 'Status', options: ['active', 'completed', 'revoked'].map((s) => ({ value: s, label: titleCase(s) })) }]}
        columns={[
          { key: 'user', label: 'Learner', render: (e) => <div><div className="cell-title">{e.user?.name}</div><div className="cell-sub">{e.user?.email}</div></div> },
          { key: 'course', label: 'Course', render: (e) => e.course?.title },
          { key: 'source', label: 'Source', render: (e) => titleCase(e.source) },
          { key: 'progress', label: 'Progress', render: (e) => `${e.progressPercent}%` },
          { key: 'status', label: 'Status', render: (e) => R.statusBadge(e.status) },
        ]}
        rowActions={(e, { reload }) => (e.status === 'revoked'
          ? <button type="button" className="btn btn-text btn-sm" onClick={() => setStatus(e, 'active', reload)}>Restore</button>
          : <button type="button" className="btn btn-text btn-sm" onClick={() => setStatus(e, 'revoked', reload)}>Revoke</button>)}
      />
      <Modal open={grant} onClose={() => setGrant(false)} title="Grant course access" size="sm" footer={<><button type="button" className="btn btn-outline btn-sm" onClick={() => setGrant(false)}>Cancel</button><button type="button" className="btn btn-sm" onClick={submitGrant} disabled={busy || !values.userId || !values.courseId}>{busy && <span className="spinner" aria-hidden />} Grant Access</button></>}>
        <FormFields fields={grantFields} values={values} onChange={setValues} />
      </Modal>
    </>
  );
}

export const CertificatesScreen = () => (
  <ResourceManager
    title="Certificates"
    endpoint="/certificates"
    entity="certificate"
    searchable={false}
    canCreate={false}
    canEdit={false}
    canDelete={false}
    columns={[
      { key: 'certificateNumber', label: 'Number', render: (c) => <code>{c.certificateNumber}</code> },
      { key: 'learnerName', label: 'Learner' },
      { key: 'courseTitle', label: 'Course' },
      { key: 'completedAt', label: 'Completed', render: (c) => formatDate(c.completedAt) },
    ]}
    rowActions={(c) => <Link to={`/certificates/${c.certificateNumber}`} className="icon-btn" target="_blank" aria-label="View"><LuEye /></Link>}
  />
);
