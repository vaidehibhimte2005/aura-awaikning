/**
 * Staff screens for the approval workflow. Managers act; admins audit (read-only
 * unless an administrator has explicitly granted them the review permission —
 * the API enforces this, the UI only hides buttons).
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LuCheck, LuEye, LuFileSearch, LuHistory, LuMessageCircleQuestion, LuSearch, LuX } from 'react-icons/lu';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { Alert, EmptyState, ErrorState, Loader } from '../components/States.jsx';
import { Modal } from '../components/Modal.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { formatDate, formatDateTime, formatPrice, titleCase } from '../utils/format.js';
import { statusBadge } from '../panel/resources.jsx';

function PageHead({ title, description, children }) {
  return (
    <div className="panel-head">
      <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
      <div className="row">{children}</div>
    </div>
  );
}

/** Asks for a reason (mandatory for rejections / change requests). */
function ReasonDialog({ open, title, label, required, confirmLabel, danger, busy, onConfirm, onCancel }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const submit = () => {
    if (required && !text.trim()) { setErr('A reason is required.'); return; }
    onConfirm(text.trim());
  };
  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      title={title}
      footer={(
        <>
          <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
          <button type="button" className={`btn btn-sm${danger ? ' btn-danger' : ''}`} onClick={submit} disabled={busy} aria-busy={busy}>
            {busy && <span className="spinner" aria-hidden />} {confirmLabel}
          </button>
        </>
      )}
    >
      <label className="label" htmlFor="reason-text">{label}{required && <span className="req" aria-hidden>*</span>}</label>
      <textarea id="reason-text" className="textarea" rows={4} value={text} onChange={(e) => { setText(e.target.value); setErr(''); }} autoFocus />
      {err && <span className="error-text">{err}</span>}
    </Modal>
  );
}

function Toolbar({ children }) {
  return <div className="rm-toolbar" style={{ flexWrap: 'wrap' }}>{children}</div>;
}

function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="search-box">
      <LuSearch aria-hidden />
      <input className="input" type="search" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    </div>
  );
}

// ─── Trainer applications ─────────────────────────────────
const APP_STATUSES = ['PENDING', 'UNDER_REVIEW', 'NEEDS_INFORMATION', 'APPROVED', 'REJECTED'];

function ApplicationDetail({ id, canReview, onClose, onChanged }) {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(`/trainer-applications/${id}`);
  const [action, setAction] = useState(null); // { decision, title, required, danger }
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const act = async (decision, reason = '') => {
    setBusy(true);
    try {
      await api.post(`/trainer-applications/${id}/review`, { decision, reason });
      toast.success(`Application ${decision === 'start_review' ? 'moved to review' : decision.replace('_', ' ')}`);
      setAction(null);
      reload();
      onChanged();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  const addNote = async () => {
    if (!note.trim()) return;
    try {
      await api.post(`/trainer-applications/${id}/notes`, { text: note.trim() });
      setNote('');
      reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const app = data?.application;
  const p = data?.profile;
  const status = app?.status;
  const open = ['PENDING', 'UNDER_REVIEW'].includes(status);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={app ? `Application ${app.applicationId}` : 'Application'}
      footer={canReview && app && (
        <>
          {['PENDING', 'NEEDS_INFORMATION'].includes(status) && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => act('start_review')} disabled={busy}><LuFileSearch /> Start review</button>
          )}
          {open && (
            <>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setAction({ decision: 'request_information', title: 'Request more information', label: 'What does the applicant need to add or fix?', required: true, confirm: 'Send request' })}><LuMessageCircleQuestion /> Request info</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setAction({ decision: 'reject', title: 'Reject application', label: 'Reason for rejection (shown to the applicant)', required: true, danger: true, confirm: 'Reject application' })}><LuX /> Reject</button>
              <button type="button" className="btn btn-sm" onClick={() => act('approve')} disabled={busy}><LuCheck /> Approve</button>
            </>
          )}
        </>
      )}
    >
      {loading && !data ? <Loader /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <div className="stack" style={{ '--stack': '22px' }}>
          <dl className="detail-grid">
            <div><dt>Applicant</dt><dd>{app.user?.name}</dd></div>
            <div><dt>Status</dt><dd>{statusBadge(app.status)}</dd></div>
            <div><dt>Email</dt><dd>{app.user?.email}{app.user?.emailVerified ? ' ✓' : ''}</dd></div>
            <div><dt>Mobile</dt><dd>{app.user?.phone || '—'}</dd></div>
            <div><dt>Submitted</dt><dd>{formatDateTime(app.submittedAt)}</dd></div>
            <div><dt>Reviewed by</dt><dd>{app.reviewedBy ? `${app.reviewedBy.name} · ${formatDateTime(app.reviewedAt)}` : '—'}</dd></div>
            <div><dt>Location</dt><dd>{[p?.location?.city, p?.location?.state, p?.location?.country].filter(Boolean).join(', ') || '—'}</dd></div>
            <div><dt>Experience</dt><dd>{p?.experienceYears ?? 0} years</dd></div>
          </dl>

          <section>
            <h3 className="eyebrow">Professional</h3>
            <p style={{ margin: '0 0 6px' }}><strong>{p?.displayName}</strong> — {p?.title}</p>
            <p>{p?.shortBio}</p>
            <dl className="detail-grid">
              <div><dt>Expertise</dt><dd>{p?.specialties?.join(', ') || '—'}</dd></div>
              <div><dt>Languages</dt><dd>{p?.languages?.join(', ') || '—'}</dd></div>
              <div><dt>Organization</dt><dd>{p?.organization || '—'}</dd></div>
              <div><dt>Website</dt><dd>{p?.socials?.website ? <a href={p.socials.website} target="_blank" rel="noreferrer noopener">{p.socials.website}</a> : '—'}</dd></div>
            </dl>
            <h4 style={{ marginBottom: 4 }}>Qualifications &amp; certifications</h4>
            <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{p?.qualifications || '—'}</p>
          </section>

          <section>
            <h3 className="eyebrow">Teaching</h3>
            <dl className="detail-grid">
              <div><dt>Categories</dt><dd>{p?.teachingCategories?.join(', ') || '—'}</dd></div>
              <div><dt>Topics</dt><dd>{p?.topics?.join(', ') || '—'}</dd></div>
              <div><dt>Format</dt><dd>{titleCase(p?.teachingFormat || '')} · {titleCase(p?.sessionType || '')} sessions</dd></div>
              <div><dt>Session length</dt><dd>{p?.sessionDuration || '—'}</dd></div>
              <div><dt>Intro video</dt><dd>{p?.introVideoUrl ? <a href={p.introVideoUrl} target="_blank" rel="noreferrer noopener">Watch</a> : '—'}</dd></div>
              <div><dt>Audience</dt><dd>{p?.targetAudience || '—'}</dd></div>
            </dl>
            <h4 style={{ marginBottom: 4 }}>Approach &amp; methodology</h4>
            <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{p?.methodology || '—'}</p>
          </section>

          {app.decisionReason && <Alert type="warning">Last decision note: {app.decisionReason}</Alert>}

          <section>
            <h3 className="eyebrow"><LuHistory aria-hidden /> History</h3>
            <ol className="timeline">
              {app.history.map((h, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <li key={i}>
                  <strong>{h.from ? `${titleCase(h.from.toLowerCase())} → ` : ''}{titleCase(h.to.toLowerCase())}</strong>
                  <span className="small muted">{formatDateTime(h.at)}{h.by ? ` · ${h.by.name} (${h.by.role})` : ''}</span>
                  {h.reason && <span className="small">{h.reason}</span>}
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h3 className="eyebrow">Internal notes <span className="muted small">(staff only — never shown to the applicant)</span></h3>
            <div className="note-list">
              {app.internalNotes?.length ? app.internalNotes.map((n, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={i}>{n.text}<div className="small muted">{n.by?.name} · {formatDateTime(n.at)}</div></div>
              )) : <span className="muted small">No notes yet.</span>}
            </div>
            {canReview && (
              <div className="list-editor-row">
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note" aria-label="Internal note" />
                <button type="button" className="btn btn-outline btn-sm" onClick={addNote} disabled={!note.trim()}>Add note</button>
              </div>
            )}
          </section>
        </div>
      )}

      {action && (
        <ReasonDialog
          open
          title={action.title}
          label={action.label}
          required={action.required}
          danger={action.danger}
          confirmLabel={action.confirm}
          busy={busy}
          onCancel={() => setAction(null)}
          onConfirm={(reason) => act(action.decision, reason)}
        />
      )}
    </Modal>
  );
}

export function TrainerApplicationsScreen() {
  useSeo({ title: 'Trainer Applications', noindex: true });
  const { can } = useAuth();
  const canReview = can('trainers:review');
  const [params, setParams] = useState({ q: '', status: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const { data, meta, loading, error, reload } = useFetch('/trainer-applications', { ...params, page, limit: 15 });
  const set = (k) => (v) => { setParams((p) => ({ ...p, [k]: v })); setPage(1); };
  const counts = meta?.counts || {};

  return (
    <div>
      <PageHead title="Trainer applications" description={canReview ? 'Review, approve or return trainer applications.' : 'Audit view — approvals are handled by managers.'} />
      <div className="status-pills" role="group" aria-label="Filter by status">
        <button type="button" className={`status-pill${!params.status ? ' is-on' : ''}`} onClick={() => set('status')('')}>All</button>
        {APP_STATUSES.map((s) => (
          <button key={s} type="button" className={`status-pill${params.status === s ? ' is-on' : ''}`} onClick={() => set('status')(s)}>
            {titleCase(s.toLowerCase())}<b>{counts[s] || 0}</b>
          </button>
        ))}
      </div>
      <Toolbar>
        <SearchInput value={params.q} onChange={set('q')} placeholder="Search name, email, phone or application ID" />
        <label><span className="sr-only">Submitted from</span><input className="input" type="date" value={params.from} onChange={(e) => set('from')(e.target.value)} aria-label="Submitted from" /></label>
        <label><span className="sr-only">Submitted to</span><input className="input" type="date" value={params.to} onChange={(e) => set('to')(e.target.value)} aria-label="Submitted to" /></label>
        {meta && <span className="muted small" style={{ marginLeft: 'auto' }}>{meta.total} application{meta.total === 1 ? '' : 's'}</span>}
      </Toolbar>

      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Loader /> : !data?.length ? (
        <EmptyState title="No applications found" message="Try a different status, date range or search." />
      ) : (
        <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
          <table className="table table-responsive">
            <thead><tr>
              <th>Application</th><th>Applicant</th><th>Expertise</th><th>Submitted</th><th>Status</th><th>Reviewed by</th><th><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {data.map((a) => (
                <tr key={a._id}>
                  <td data-label="Application"><code>{a.applicationId}</code></td>
                  <td data-label="Applicant"><div className="cell-title">{a.user?.name}</div><div className="cell-sub">{a.user?.email}</div></td>
                  <td data-label="Expertise">{a.trainer?.specialties?.slice(0, 3).join(', ') || '—'}<div className="cell-sub">{a.trainer?.experienceYears ?? 0} yrs</div></td>
                  <td data-label="Submitted">{formatDateTime(a.submittedAt)}</td>
                  <td data-label="Status">{statusBadge(a.status)}</td>
                  <td data-label="Reviewed by">{a.reviewedBy?.name || '—'}{a.reviewedAt && <div className="cell-sub">{formatDate(a.reviewedAt)}</div>}</td>
                  <td className="actions"><button type="button" className="btn btn-outline btn-sm" onClick={() => setOpenId(a._id)}><LuEye /> {canReview && ['PENDING', 'UNDER_REVIEW'].includes(a.status) ? 'Review' : 'View'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {meta && <Pagination page={meta.page} pages={meta.pages} onChange={setPage} />}
      {openId && <ApplicationDetail id={openId} canReview={canReview} onClose={() => setOpenId(null)} onChanged={reload} />}
    </div>
  );
}

// ─── Course approvals ─────────────────────────────────────
const COURSE_FILTERS = [
  { value: 'pending_approval', label: 'Pending' },
  { value: 'under_review', label: 'Under review' },
  { value: 'needs_revision', label: 'Needs revision' },
  { value: 'approved', label: 'Approved' },
  { value: 'published', label: 'Published' },
  { value: 'rejected', label: 'Rejected' },
  { value: '', label: 'All' },
];

function CourseHistory({ id, onClose }) {
  const { data, loading, error } = useFetch(`/courses/${id}/history`);
  return (
    <Modal open onClose={onClose} title={data ? `History — ${data.title}` : 'Course history'} size="sm">
      {loading && !data ? <Loader /> : error ? <ErrorState error={error} /> : (
        <>
          <dl className="detail-grid" style={{ marginBottom: 18 }}>
            <div><dt>Submitted</dt><dd>{data.submittedAt ? formatDateTime(data.submittedAt) : '—'}</dd></div>
            <div><dt>Approved</dt><dd>{data.approvedAt ? `${formatDateTime(data.approvedAt)}${data.approvedBy ? ` · ${data.approvedBy.name}` : ''}` : '—'}</dd></div>
            <div><dt>Published</dt><dd>{data.publishedAt ? formatDateTime(data.publishedAt) : '—'}</dd></div>
          </dl>
          <ol className="timeline">
            {data.statusHistory.map((h, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <li key={i}>
                <strong>{h.from ? `${titleCase(h.from)} → ` : ''}{titleCase(h.to)}</strong>
                <span className="small muted">{formatDateTime(h.at)}{h.by ? ` · ${h.by.name} (${h.by.role})` : ''}</span>
                {h.reason && <span className="small">{h.reason}</span>}
              </li>
            ))}
          </ol>
        </>
      )}
    </Modal>
  );
}

export function CourseApprovalsScreen() {
  useSeo({ title: 'Course Approvals', noindex: true });
  const { can } = useAuth();
  const toast = useToast();
  const canReview = can('courses:review');
  const [search] = useSearchParams();
  const [status, setStatus] = useState(search.get('status') ?? 'pending_approval');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [reason, setReason] = useState(null); // { course, decision, ... }
  const [history, setHistory] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data, meta, loading, error, reload } = useFetch('/courses', { scope: 'manage', status: status || undefined, q: q || undefined, page, limit: 15 });

  const review = async (course, decision, text = '') => {
    setBusy(true);
    try {
      await api.post(`/courses/${course._id}/review`, { decision, reason: text });
      toast.success(decision === 'approve' ? 'Course approved — the trainer can now publish it' : 'Decision recorded');
      setReason(null);
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead title="Course approvals" description={canReview ? 'Approve, reject or request changes before courses reach learners.' : 'Audit view — approvals are handled by managers.'} />
      <div className="status-pills" role="group" aria-label="Filter by status">
        {COURSE_FILTERS.map((f) => (
          <button key={f.value} type="button" className={`status-pill${status === f.value ? ' is-on' : ''}`} onClick={() => { setStatus(f.value); setPage(1); }}>{f.label}</button>
        ))}
      </div>
      <Toolbar>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search courses" />
        {meta && <span className="muted small" style={{ marginLeft: 'auto' }}>{meta.total} course{meta.total === 1 ? '' : 's'}</span>}
      </Toolbar>

      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Loader /> : !data?.length ? (
        <EmptyState title="Nothing here" message={status === 'pending_approval' ? 'No courses are waiting for approval.' : 'No courses match this filter.'} />
      ) : (
        <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
          <table className="table table-responsive">
            <thead><tr><th>Course</th><th>Trainer</th><th>Price</th><th>Lessons</th><th>Submitted</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.map((c) => {
                const reviewable = ['pending_approval', 'under_review'].includes(c.status);
                return (
                  <tr key={c._id}>
                    <td data-label="Course"><div className="cell-title">{c.title}</div><div className="cell-sub">{c.category?.name || 'Uncategorised'}{c.isDemo ? ' · demo' : ''}</div></td>
                    <td data-label="Trainer">{c.trainers?.map((t) => t.displayName).join(', ') || '—'}</td>
                    <td data-label="Price">{formatPrice(c.price, c.currency)}</td>
                    <td data-label="Lessons">{c.lessonCount || 0}</td>
                    <td data-label="Submitted">{c.submittedAt ? formatDateTime(c.submittedAt) : '—'}</td>
                    <td data-label="Status">{statusBadge(c.status)}{c.reviewNote && ['rejected', 'needs_revision'].includes(c.status) && <div className="cell-sub">{c.reviewNote}</div>}</td>
                    <td className="actions">
                      <Link to={`/courses/${c.slug}`} target="_blank" className="icon-btn" aria-label="Preview course" title="Preview"><LuEye /></Link>
                      <button type="button" className="icon-btn" aria-label="View history" title="History" onClick={() => setHistory(c._id)}><LuHistory /></button>
                      {canReview && c.status === 'pending_approval' && <button type="button" className="icon-btn" aria-label="Start review" title="Start review" onClick={() => review(c, 'start_review')}><LuFileSearch /></button>}
                      {canReview && reviewable && (
                        <>
                          <button type="button" className="icon-btn" aria-label="Approve" title="Approve" onClick={() => review(c, 'approve')}><LuCheck /></button>
                          <button type="button" className="icon-btn" aria-label="Request changes" title="Request changes" onClick={() => setReason({ course: c, decision: 'request_changes', title: 'Request changes', label: 'What should the trainer change?', confirm: 'Send request' })}><LuMessageCircleQuestion /></button>
                          <button type="button" className="icon-btn" aria-label="Reject" title="Reject" onClick={() => setReason({ course: c, decision: 'reject', title: 'Reject course', label: 'Reason for rejection', confirm: 'Reject course', danger: true })}><LuX /></button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {meta && <Pagination page={meta.page} pages={meta.pages} onChange={setPage} />}
      {reason && (
        <ReasonDialog
          open
          title={reason.title}
          label={reason.label}
          required
          danger={reason.danger}
          confirmLabel={reason.confirm}
          busy={busy}
          onCancel={() => setReason(null)}
          onConfirm={(text) => review(reason.course, reason.decision, text)}
        />
      )}
      {history && <CourseHistory id={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

// ─── Activity log ─────────────────────────────────────────
const ENTITY_TYPES = [
  { value: '', label: 'All activity' },
  { value: 'trainer_application', label: 'Trainer applications' },
  { value: 'course', label: 'Courses' },
  { value: 'user', label: 'Users' },
  { value: 'booking', label: 'Bookings' },
  { value: 'earning', label: 'Payouts' },
  { value: 'package', label: 'Packages' },
  { value: 'subscription', label: 'Subscriptions' },
  { value: 'config', label: 'Settings' },
];

export function ActivityLogScreen() {
  useSeo({ title: 'Activity Log', noindex: true });
  const [entityType, setEntityType] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useFetch('/activity-logs', { entityType: entityType || undefined, q: q || undefined, page, limit: 25 });
  return (
    <div>
      <PageHead title="Activity log" description="Who did what, and when, across approvals and publishing." />
      <Toolbar>
        <label>
          <span className="sr-only">Type</span>
          <select className="select" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>
            {ENTITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search by course title or application ID" />
      </Toolbar>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Loader /> : !data?.length ? <EmptyState title="No activity yet" /> : (
        <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
          <table className="table table-responsive">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Change</th><th>Reason</th></tr></thead>
            <tbody>
              {data.map((l) => (
                <tr key={l._id}>
                  <td data-label="When">{formatDateTime(l.createdAt)}</td>
                  <td data-label="Who">{l.actor?.name || 'System'}{l.actorRole && <div className="cell-sub">{l.actorRole}</div>}</td>
                  <td data-label="Action">{titleCase(l.action.replace('.', ' · '))}</td>
                  <td data-label="Record">{l.entityLabel || '—'}<div className="cell-sub">{titleCase(l.entityType)}</div></td>
                  <td data-label="Change">{l.from || l.to ? `${titleCase(l.from?.toLowerCase() || '—')} → ${titleCase(l.to?.toLowerCase() || '—')}` : '—'}</td>
                  <td data-label="Reason">{l.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {meta && <Pagination page={meta.page} pages={meta.pages} onChange={setPage} />}
    </div>
  );
}

// ─── Directories (read-only) ──────────────────────────────
export function LearnerDirectoryScreen() {
  useSeo({ title: 'Learners', noindex: true });
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useFetch('/dashboard/learners', { q: q || undefined, page, limit: 20 });
  const e = meta?.enrollments || {};
  return (
    <div>
      <PageHead title="Learners" description="Registered learners and an overview of enrollments." />
      <div className="stats">
        <div className="stat"><span className="stat-label">Registered learners</span><span className="stat-value">{meta?.total ?? '—'}</span></div>
        <div className="stat"><span className="stat-label">Active enrollments</span><span className="stat-value">{e.active || 0}</span></div>
        <div className="stat"><span className="stat-label">Completed</span><span className="stat-value">{e.completed || 0}</span></div>
      </div>
      <Toolbar><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name, email or phone" /></Toolbar>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Loader /> : !data?.length ? <EmptyState title="No learners found" /> : (
        <div className="table-wrap">
          <table className="table table-responsive">
            <thead><tr><th>Learner</th><th>Mobile</th><th>Location</th><th>Interests</th><th>Courses</th><th>Joined</th></tr></thead>
            <tbody>
              {data.map((u) => (
                <tr key={u._id}>
                  <td data-label="Learner"><div className="cell-title">{u.name}</div><div className="cell-sub">{u.email}</div></td>
                  <td data-label="Mobile">{u.phone || '—'}</td>
                  <td data-label="Location">{[u.location?.city, u.location?.state].filter(Boolean).join(', ') || '—'}</td>
                  <td data-label="Interests">{u.interests?.slice(0, 3).join(', ') || '—'}</td>
                  <td data-label="Courses">{u.enrollmentCount}</td>
                  <td data-label="Joined">{formatDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {meta && <Pagination page={meta.page} pages={meta.pages} onChange={setPage} />}
    </div>
  );
}

export function TrainerDirectoryScreen() {
  useSeo({ title: 'Trainers', noindex: true });
  const { data, loading, error, reload } = useFetch('/trainers', { limit: 60 });
  return (
    <div>
      <PageHead title="Trainer directory" description="Approved trainers visible to learners." />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Loader /> : !data?.length ? (
        <EmptyState title="No approved trainers yet" message="Approve a trainer application to add them here." />
      ) : (
        <div className="table-wrap">
          <table className="table table-responsive">
            <thead><tr><th>Trainer</th><th>Headline</th><th>Expertise</th><th>Experience</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.map((t) => (
                <tr key={t._id}>
                  <td data-label="Trainer"><div className="cell-title">{t.displayName}</div></td>
                  <td data-label="Headline">{t.title || '—'}</td>
                  <td data-label="Expertise">{t.specialties?.slice(0, 4).join(', ') || '—'}</td>
                  <td data-label="Experience">{t.experienceYears} yrs</td>
                  <td className="actions"><Link to={`/trainers/${t.slug}`} target="_blank" className="icon-btn" aria-label="View public profile"><LuEye /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
