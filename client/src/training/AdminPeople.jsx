import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCalendarDays, LuEye, LuIndianRupee, LuPencil, LuPlus, LuPower, LuTriangleAlert, LuUsers } from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../services/api.js';
import { PagedTable } from '../panel/PagedTable.jsx';
import { ConfirmDialog, Modal } from '../components/Modal.jsx';
import { Alert, ErrorState, Loader } from '../components/States.jsx';
import { TextField } from '../components/Form.jsx';
import { formatDate, formatDateTime, formatPrice } from '../utils/format.js';
import { statusBadge } from '../panel/resources.jsx';
import { BookingBadge, PageHead, PhaseBadge, Stat } from './common.jsx';

export function AdminOverview() {
  useSeo({ title: 'Admin', noindex: true });
  const { data, loading, error, reload } = useFetch('/admin/overview');
  if (loading && !data) return <Loader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const cur = data.currency;
  const p = data.payouts || {};
  return (
    <div>
      <PageHead title="Dashboard" description="Learners, packages, sessions and payouts at a glance.">
        <Link to="/admin/trainers" className="btn btn-sm"><LuPlus /> Add trainer</Link>
      </PageHead>
      <div className="stats">
        <Stat label="Package revenue" value={formatPrice(data.revenue, cur)} sub={`${data.paidOrders} paid order(s)`} icon={LuIndianRupee} />
        <Stat label="Learners" value={data.learners} icon={LuUsers} />
        <Stat label="Active trainers" value={data.trainers} />
        <Stat label="Active packages" value={data.activeSubscriptions} sub={`${data.expiringSoon} expiring in 7 days`} />
        <Stat label="Upcoming sessions" value={data.upcomingBookings} icon={LuCalendarDays} />
        <Stat label="Completed sessions" value={data.completedSessions} />
        <Stat label="Pending payouts" value={formatPrice(p.pending?.amount || 0, cur)} sub={`${p.pending?.count || 0} to approve`} />
        <Stat label="Approved, unpaid" value={formatPrice(p.approved?.amount || 0, cur)} sub={`${p.approved?.count || 0} to pay`} />
      </div>
      {(data.needsReview > 0 || (p.pending?.count || 0) > 0) && (
        <div className="stack" style={{ marginBottom: 20, '--stack': '10px' }}>
          {data.needsReview > 0 && <Alert type="warning"><LuTriangleAlert aria-hidden style={{ verticalAlign: '-2px' }} /> {data.needsReview} session(s) need an attendance decision. <Link to="/admin/bookings?status=needs_review">Review now</Link></Alert>}
          {(p.pending?.count || 0) > 0 && <Alert type="info">{p.pending.count} trainer earning(s) are waiting for approval. <Link to="/admin/payouts">Open payouts</Link></Alert>}
        </div>
      )}
      <section className="panel-card">
        <div className="panel-card-head"><h2>Recent package payments</h2><Link to="/admin/payments" className="btn btn-text btn-sm">View all</Link></div>
        <div className="panel-card-body">
          {data.recentPayments.length ? data.recentPayments.map((x) => (
            <div className="list-row" key={x._id}>
              <div className="grow"><strong>{x.user?.name || 'Unknown'} — {x.package?.name}</strong><span className="small muted">{formatDateTime(x.createdAt)}</span></div>
              <span>{formatPrice(x.amount, x.currency)}</span>{statusBadge(x.status)}
            </div>
          )) : <p className="muted" style={{ margin: 0 }}>No payments yet.</p>}
        </div>
      </section>
    </div>
  );
}

const csvToList = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

function TrainerForm({ initial, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !initial;
  const [f, setF] = useState({
    name: initial?.name || '', email: initial?.email || '', phone: initial?.phone || '', password: '', title: initial?.profile?.title || '',
    shortBio: initial?.profile?.shortBio || '', bio: initial?.profile?.bio || '', specialties: (initial?.profile?.specialties || []).join(', '),
    languages: (initial?.profile?.languages || []).join(', '), experienceYears: initial?.profile?.experienceYears ?? 0,
    payoutPerSession: initial?.profile?.payoutPerSession ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fe, setFe] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(''); setFe({});
    const body = {
      name: f.name, phone: f.phone, title: f.title, shortBio: f.shortBio, bio: f.bio,
      specialties: csvToList(f.specialties), languages: csvToList(f.languages), experienceYears: Number(f.experienceYears) || 0,
      payoutPerSession: f.payoutPerSession === '' ? null : Number(f.payoutPerSession),
    };
    try {
      if (isNew) {
        const { data } = await api.post('/admin/trainers', { ...body, email: f.email, password: f.password || undefined });
        toast.success('Trainer account created');
        onSaved(data);
      } else {
        const { data } = await api.patch(`/admin/trainers/${initial._id}`, { ...body, ...(f.password ? { newPassword: f.password } : {}) });
        toast.success('Trainer updated');
        onSaved(data);
      }
    } catch (ex) { setErr(ex.message); setFe(ex.fieldErrors || {}); } finally { setBusy(false); }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isNew ? 'Register a trainer' : `Edit ${initial.name}`}
      footer={<><button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button><button type="submit" form="trainer-form" className="btn btn-sm" disabled={busy}>{busy && <span className="spinner" aria-hidden />} {isNew ? 'Create trainer' : 'Save changes'}</button></>}
    >
      <form id="trainer-form" onSubmit={submit} noValidate>
        {err && <div style={{ marginBottom: 14 }}><Alert>{err}</Alert></div>}
        <div className="form-row">
          <TextField label="Full name" required value={f.name} onChange={set('name')} error={fe.name} />
          <TextField label="Email (login)" type="email" required={isNew} disabled={!isNew} value={f.email} onChange={set('email')} error={fe.email} />
        </div>
        <div className="form-row">
          <TextField label="Mobile number" type="tel" required value={f.phone} onChange={set('phone')} error={fe.phone} />
          <TextField label={isNew ? 'Initial password' : 'Reset password'} type="text" autoComplete="off" value={f.password} onChange={set('password')} error={fe.password || fe.newPassword} hint={isNew ? 'Leave blank to generate one — it is shown once' : 'Leave blank to keep the current password'} />
        </div>
        <div className="form-row">
          <TextField label="Headline" value={f.title} onChange={set('title')} error={fe.title} />
          <TextField label="Payout per eligible session" type="number" min={0} step="1" value={f.payoutPerSession} onChange={set('payoutPerSession')} error={fe.payoutPerSession} hint="Leave blank to use the default rate from Settings" />
        </div>
        <TextField label="Short bio" multiline rows={2} maxLength={240} value={f.shortBio} onChange={set('shortBio')} error={fe.shortBio} />
        <div className="form-row" style={{ marginTop: 14 }}>
          <TextField label="Specialties" value={f.specialties} onChange={set('specialties')} hint="Comma separated" />
          <TextField label="Languages" value={f.languages} onChange={set('languages')} hint="Comma separated" />
        </div>
        <TextField label="Years of experience" type="number" min={0} max={80} value={f.experienceYears} onChange={set('experienceYears')} />
      </form>
    </Modal>
  );
}

export function AdminTrainers() {
  useSeo({ title: 'Trainers', noindex: true });
  const toast = useToast();
  const [editing, setEditing] = useState(null); // null | 'new' | trainer
  const [created, setCreated] = useState(null);
  const [toggle, setToggle] = useState(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);
  const refresh = () => setKey((k) => k + 1);

  const doToggle = async () => {
    setBusy(true);
    try {
      const { data } = await api.patch(`/admin/trainers/${toggle._id}`, { isActive: !toggle.isActive });
      toast.success(toggle.isActive ? 'Trainer deactivated' : 'Trainer activated');
      if (data.warning) toast.error(data.warning);
      setToggle(null);
      refresh();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHead title="Trainers" description="Trainer accounts are created here by administrators — trainers cannot self-register.">
        <button type="button" className="btn" onClick={() => setEditing('new')}><LuPlus /> Register trainer</button>
      </PageHead>
      <PagedTable
        endpoint="/admin/trainers"
        refreshKey={key}
        searchable
        searchPlaceholder="Search name or email…"
        filters={[{ name: 'status', label: 'Status', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] }]}
        emptyTitle="No trainers yet"
        empty="Register your first trainer to start offering sessions."
        columns={[
          { key: 'name', label: 'Trainer', render: (t) => <div><div className="cell-title">{t.name}</div><div className="cell-sub">{t.email}{t.phone ? ` · ${t.phone}` : ''}</div></div> },
          { key: 'isActive', label: 'Status', render: (t) => <span className={`badge ${t.isActive ? 'badge-success' : 'badge-muted'}`}>{t.isActive ? 'Active' : 'Inactive'}</span> },
          { key: 'payout', label: 'Payout / session', render: (t) => formatPrice(t.effectivePayout, 'INR') + (t.profile?.payoutPerSession == null ? ' (default)' : '') },
          { key: 'sessions', label: 'Completed', render: (t) => t.completedSessions },
          { key: 'open', label: 'Open slots', render: (t) => t.openSlots },
          { key: 'earn', label: 'Earnings', render: (t) => <div><div>Pending {formatPrice(t.earnings.pending + t.earnings.approved, 'INR')}</div><div className="cell-sub">Paid {formatPrice(t.earnings.paid, 'INR')}</div></div> },
        ]}
        rowActions={(t) => (
          <>
            <button type="button" className="icon-btn" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`} title="Edit"><LuPencil /></button>
            <button type="button" className="icon-btn" onClick={() => setToggle(t)} aria-label={t.isActive ? `Deactivate ${t.name}` : `Activate ${t.name}`} title={t.isActive ? 'Deactivate' : 'Activate'}><LuPower /></button>
          </>
        )}
      />
      {editing && (
        <TrainerForm
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(data) => { const wasNew = editing === 'new'; setEditing(null); refresh(); if (wasNew) setCreated(data); }}
        />
      )}
      <Modal open={!!created} onClose={() => setCreated(null)} title="Trainer created" size="sm" footer={<button type="button" className="btn btn-sm" onClick={() => setCreated(null)}>Done</button>}>
        {created && (
          <>
            <p style={{ marginTop: 0 }}>The account for <strong>{created.email}</strong> is active. The trainer can log in right away.</p>
            {created.temporaryPassword ? (
              <Alert type="warning">Temporary password (shown only once — copy it now): <code style={{ fontSize: '1.05rem' }}>{created.temporaryPassword}</code></Alert>
            ) : <p className="muted small">They sign in with the password you set.</p>}
          </>
        )}
      </Modal>
      <ConfirmDialog
        open={!!toggle}
        danger={!!toggle?.isActive}
        busy={busy}
        title={toggle?.isActive ? 'Deactivate this trainer?' : 'Activate this trainer?'}
        message={toggle?.isActive ? 'They will be logged out of new sessions, hidden from learners and their open slots withdrawn. Existing bookings are kept for you to handle.' : 'They will be able to log in and publish availability again.'}
        confirmLabel={toggle?.isActive ? 'Deactivate' : 'Activate'}
        onConfirm={doToggle}
        onCancel={() => setToggle(null)}
      />
    </div>
  );
}

function LearnerDetail({ id, onClose }) {
  const { data, loading, error, reload } = useFetch(`/admin/learners/${id}`);
  return (
    <Modal open onClose={onClose} size="lg" title={data ? data.user.name : 'Learner'} footer={<button type="button" className="btn btn-sm" onClick={onClose}>Close</button>}>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Loader /> : (
        <div className="stack" style={{ '--stack': '22px' }}>
          <dl className="detail-grid">
            <div><dt>Email</dt><dd>{data.user.email}</dd></div>
            <div><dt>Mobile</dt><dd>{data.user.phone || '—'}</dd></div>
            <div><dt>Joined</dt><dd>{formatDate(data.user.createdAt)}</dd></div>
            <div><dt>Account</dt><dd>{data.user.isActive ? 'Active' : 'Disabled'}</dd></div>
          </dl>
          <section>
            <h3 style={{ fontSize: '1.15rem' }}>Packages</h3>
            {!data.subscriptions.length ? <p className="muted">No packages purchased.</p> : (
              <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>Package</th><th>Period</th><th>Days used</th><th>Status</th></tr></thead><tbody>
                {data.subscriptions.map((s) => <tr key={s._id}><td data-label="Package">{s.packageName}</td><td data-label="Period">{formatDate(s.startsAt)} → {formatDate(s.expiresAt)}</td><td data-label="Days used">{s.daysUsed}/{s.trainingDays}</td><td data-label="Status"><PhaseBadge phase={s.phase} /></td></tr>)}
              </tbody></table></div>
            )}
          </section>
          <section>
            <h3 style={{ fontSize: '1.15rem' }}>Recent sessions</h3>
            {!data.bookings.length ? <p className="muted">No bookings yet.</p> : (
              <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>When</th><th>Trainer</th><th>Status</th></tr></thead><tbody>
                {data.bookings.slice(0, 10).map((b) => <tr key={b._id}><td data-label="When">{formatDateTime(b.startAt)}</td><td data-label="Trainer">{b.trainer?.name}</td><td data-label="Status"><BookingBadge status={b.status} /></td></tr>)}
              </tbody></table></div>
            )}
          </section>
          <section>
            <h3 style={{ fontSize: '1.15rem' }}>Payments</h3>
            {!data.payments.length ? <p className="muted">No payments.</p> : (
              <div className="table-wrap"><table className="table table-responsive"><thead><tr><th>Date</th><th>Package</th><th>Amount</th><th>Status</th></tr></thead><tbody>
                {data.payments.map((p) => <tr key={p._id}><td data-label="Date">{formatDate(p.createdAt)}</td><td data-label="Package">{p.package?.name}</td><td data-label="Amount">{formatPrice(p.amount, p.currency)}</td><td data-label="Status">{statusBadge(p.status)}</td></tr>)}
              </tbody></table></div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

export function AdminLearners() {
  useSeo({ title: 'Learners', noindex: true });
  const toast = useToast();
  const [detail, setDetail] = useState(null);
  const [toggle, setToggle] = useState(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);
  const doToggle = async () => {
    setBusy(true);
    try {
      await api.patch(`/admin/learners/${toggle._id}`, { isActive: !toggle.isActive });
      toast.success(toggle.isActive ? 'Learner disabled' : 'Learner re-enabled');
      setToggle(null);
      setKey((k) => k + 1);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <PageHead title="Learners" description="Enrollment details, package status and remaining training days." />
      <PagedTable
        endpoint="/admin/learners"
        refreshKey={key}
        searchable
        searchPlaceholder="Search name, email or mobile…"
        filters={[{ name: 'status', label: 'Account', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Disabled' }] }]}
        emptyTitle="No learners yet"
        columns={[
          { key: 'name', label: 'Learner', render: (l) => <div><div className="cell-title">{l.name}</div><div className="cell-sub">{l.email}{l.phone ? ` · ${l.phone}` : ''}</div></div> },
          { key: 'package', label: 'Package', render: (l) => l.package ? <div><div>{l.package.name}</div><div className="cell-sub">{formatDate(l.package.startsAt)} → {formatDate(l.package.expiresAt)}</div></div> : <span className="muted">None</span> },
          { key: 'phase', label: 'Status', render: (l) => (l.package ? <PhaseBadge phase={l.package.phase} /> : '—') },
          { key: 'days', label: 'Days left', render: (l) => (l.package ? `${l.remainingDays}` : '—') },
          { key: 'joined', label: 'Joined', render: (l) => formatDate(l.createdAt) },
          { key: 'acct', label: 'Account', render: (l) => <span className={`badge ${l.isActive ? 'badge-success' : 'badge-muted'}`}>{l.isActive ? 'Active' : 'Disabled'}</span> },
        ]}
        rowActions={(l) => (
          <>
            <button type="button" className="icon-btn" onClick={() => setDetail(l._id)} aria-label={`View ${l.name}`} title="View"><LuEye /></button>
            <button type="button" className="icon-btn" onClick={() => setToggle(l)} aria-label={l.isActive ? `Disable ${l.name}` : `Enable ${l.name}`} title={l.isActive ? 'Disable' : 'Enable'}><LuPower /></button>
          </>
        )}
      />
      {detail && <LearnerDetail id={detail} onClose={() => setDetail(null)} />}
      <ConfirmDialog open={!!toggle} danger={!!toggle?.isActive} busy={busy} title={toggle?.isActive ? 'Disable this account?' : 'Re-enable this account?'} message={toggle?.isActive ? 'They will no longer be able to log in or book sessions. Their package and history are kept.' : 'They will be able to log in again.'} confirmLabel={toggle?.isActive ? 'Disable' : 'Enable'} onConfirm={doToggle} onCancel={() => setToggle(null)} />
    </div>
  );
}
