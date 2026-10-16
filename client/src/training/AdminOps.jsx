import { useState } from 'react';
import { LuDownload, LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';
import { useSearchParams } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../services/api.js';
import { PagedTable } from '../panel/PagedTable.jsx';
import { ConfirmDialog, Modal } from '../components/Modal.jsx';
import { Alert, ErrorState, Loader } from '../components/States.jsx';
import { TextField } from '../components/Form.jsx';
import { statusBadge } from '../panel/resources.jsx';
import { formatDate, formatDateTime, formatPrice, formatTime, titleCase } from '../utils/format.js';
import { BookingBadge, EarningBadge, PageHead, PhaseBadge, Stat } from './common.jsx';

// ─── Packages & pricing ───────────────────────────────────
const blankPkg = { code: '', name: '', kind: 'custom', description: '', features: '', trainingDays: 1, validityDays: 1, discountType: 'percent', discountValue: 0, isActive: true, isFeatured: false, order: 0 };

function PackageForm({ initial, dailyRate, currency, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(initial ? { ...initial, features: (initial.features || []).join('\n') } : blankPkg);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fe, setFe] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const base = dailyRate * (Number(f.trainingDays) || 0);
  const disc = f.discountType === 'percent' ? (base * (Number(f.discountValue) || 0)) / 100 : Number(f.discountValue) || 0;
  const final = Math.max(0, base - Math.min(disc, base));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(''); setFe({});
    const body = {
      name: f.name, kind: f.kind, description: f.description, features: f.features.split('\n').map((x) => x.trim()).filter(Boolean),
      trainingDays: Number(f.trainingDays), validityDays: Number(f.validityDays), discountType: f.discountType, discountValue: Number(f.discountValue) || 0,
      isActive: !!f.isActive, isFeatured: !!f.isFeatured, order: Number(f.order) || 0,
    };
    try {
      if (initial) await api.patch(`/packages/${initial._id}`, body);
      else await api.post('/packages', { ...body, code: f.code });
      toast.success(initial ? 'Package updated' : 'Package created');
      onSaved();
    } catch (ex) { setErr(ex.message); setFe(ex.fieldErrors || {}); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} size="lg" title={initial ? `Edit ${initial.name}` : 'Create package'}
      footer={<><button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Cancel</button><button type="submit" form="pkg-form" className="btn btn-sm" disabled={busy}>{busy && <span className="spinner" aria-hidden />} Save</button></>}>
      <form id="pkg-form" onSubmit={submit} noValidate>
        {err && <div style={{ marginBottom: 14 }}><Alert>{err}</Alert></div>}
        <div className="form-row">
          <TextField label="Name" required value={f.name} onChange={set('name')} error={fe.name} />
          <TextField label="Code" required disabled={!!initial} value={f.code} onChange={set('code')} error={fe.code} hint="Unique, e.g. weekly-plus" />
        </div>
        <div className="form-row">
          <TextField label="Training days included" type="number" min={1} required value={f.trainingDays} onChange={set('trainingDays')} error={fe.trainingDays} />
          <TextField label="Validity (calendar days)" type="number" min={1} required value={f.validityDays} onChange={set('validityDays')} error={fe.validityDays} />
        </div>
        <div className="form-row">
          <div className="field">
            <label className="label" htmlFor="pkg-dt">Discount type</label>
            <select id="pkg-dt" className="select" value={f.discountType} onChange={set('discountType')}>
              <option value="percent">Percentage</option><option value="amount">Fixed amount</option>
            </select>
          </div>
          <TextField label={f.discountType === 'percent' ? 'Discount (%)' : `Discount (${currency})`} type="number" min={0} step="0.01" value={f.discountValue} onChange={set('discountValue')} error={fe.discountValue} />
        </div>
        <Alert type="info">Price preview at today’s base rate of {formatPrice(dailyRate, currency)}/day: {formatPrice(base, currency)} − {formatPrice(Math.min(disc, base), currency)} = <strong>{formatPrice(final, currency)}</strong></Alert>
        <div style={{ marginTop: 14 }}><TextField label="Description" multiline rows={2} maxLength={400} value={f.description} onChange={set('description')} /></div>
        <div style={{ marginTop: 14 }}><TextField label="Features (one per line)" multiline rows={4} value={f.features} onChange={set('features')} /></div>
        <div className="form-row" style={{ marginTop: 14 }}>
          <TextField label="Display order" type="number" value={f.order} onChange={set('order')} />
          <div className="field">
            <label className="checkbox"><input type="checkbox" checked={!!f.isActive} onChange={set('isActive')} /> Active (sold to learners)</label>
            <label className="checkbox"><input type="checkbox" checked={!!f.isFeatured} onChange={set('isFeatured')} /> Highlight as best value</label>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function AdminPackages() {
  useSeo({ title: 'Packages & pricing', noindex: true });
  const toast = useToast();
  const { data, loading, error, reload } = useFetch('/packages/admin/all');
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const [rate, setRate] = useState(null);
  const [busy, setBusy] = useState(false);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <Loader />;
  const { config, packages } = data;
  const rateVal = rate ?? config.dailyRate;

  const saveRate = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.put('/training-config', { dailyRate: Number(rateVal) }); toast.success('Base daily rate updated — all plans re-priced'); setRate(null); reload(); } catch (ex) { toast.error(ex.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { const { data: r } = await api.delete(`/packages/${del._id}`); toast.success(r.deactivated ? 'Package deactivated (it has purchases)' : 'Package deleted'); setDel(null); reload(); } catch (ex) { toast.error(ex.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHead title="Packages & pricing" description="Prices are never stored: they are calculated from the base daily rate and each package’s discount.">
        <button type="button" className="btn" onClick={() => setEditing('new')}><LuPlus /> Create package</button>
      </PageHead>
      <form className="panel-card panel-card-body" onSubmit={saveRate} style={{ marginBottom: 24, display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px' }}><TextField label={`Base rate per training day (${config.currency})`} type="number" min={0} step="1" value={rateVal} onChange={(e) => setRate(e.target.value)} /></div>
        <button type="submit" className="btn" disabled={busy || rate === null}>{busy && <span className="spinner" aria-hidden />} Update rate</button>
      </form>
      <div className="table-wrap">
        <table className="table table-responsive">
          <thead><tr><th>Package</th><th>Days / validity</th><th>Original</th><th>Discount</th><th>Final price</th><th>Status</th><th /></tr></thead>
          <tbody>
            {packages.map((p) => (
              <tr key={p._id}>
                <td data-label="Package"><div className="cell-title">{p.name}</div><div className="cell-sub">{p.code}</div></td>
                <td data-label="Days / validity">{p.trainingDays} days / {p.validityDays} days</td>
                <td data-label="Original">{formatPrice(p.price.baseAmount, config.currency)}</td>
                <td data-label="Discount">{p.discountType === 'percent' ? `${p.discountValue}%` : formatPrice(p.discountValue, config.currency)}<div className="cell-sub">saves {formatPrice(p.price.savings, config.currency)}</div></td>
                <td data-label="Final price"><strong>{formatPrice(p.price.amount, config.currency)}</strong></td>
                <td data-label="Status"><span className={`badge ${p.isActive ? 'badge-success' : 'badge-muted'}`}>{p.isActive ? 'Active' : 'Inactive'}</span></td>
                <td className="actions">
                  <button type="button" className="icon-btn" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}><LuPencil /></button>
                  <button type="button" className="icon-btn" onClick={() => setDel(p)} aria-label={`Delete ${p.name}`}><LuTrash2 /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <PackageForm initial={editing === 'new' ? null : editing} dailyRate={config.dailyRate} currency={config.currency} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      <ConfirmDialog open={!!del} danger busy={busy} title="Remove this package?" message="Packages that have been purchased are deactivated instead of deleted, so learners’ records stay intact." confirmLabel="Remove" onConfirm={remove} onCancel={() => setDel(null)} />
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────
function Num({ label, hint, value, onChange, ...rest }) {
  return <TextField label={label} hint={hint} type="number" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}
function Check({ label, hint, checked, onChange }) {
  return (
    <label className="toggle-row">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}{hint && <small>{hint}</small>}</span>
    </label>
  );
}

export function AdminSettings() {
  useSeo({ title: 'Settings', noindex: true });
  const toast = useToast();
  const { data, loading, error, reload } = useFetch('/training-config');
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <Loader />;
  const c = data.config;
  const v = f || {
    currency: c.currency, timezone: c.timezone, dailyRate: c.dailyRate, trainerPayoutPerSession: c.trainerPayoutPerSession,
    policy: { ...c.policy }, booking: { ...c.booking }, reminders: { expiryDays: c.reminders.expiryDays.join(', '), sessionMinutes: c.reminders.sessionMinutes }, renewal: { ...c.renewal },
  };
  const up = (path, val) => {
    const next = JSON.parse(JSON.stringify(v));
    const [a, b] = path.split('.');
    if (b) next[a][b] = val; else next[a] = val;
    setF(next);
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const n = (x) => Number(x);
    try {
      await api.put('/training-config', {
        currency: v.currency, timezone: v.timezone, dailyRate: n(v.dailyRate), trainerPayoutPerSession: n(v.trainerPayoutPerSession),
        policy: { minAttendancePct: n(v.policy.minAttendancePct), minOverlapPct: n(v.policy.minOverlapPct), joinWindowMinutes: n(v.policy.joinWindowMinutes), finalizeGraceMinutes: n(v.policy.finalizeGraceMinutes), acceptDemoAttendance: !!v.policy.acceptDemoAttendance, payTrainerOnLearnerNoShow: !!v.policy.payTrainerOnLearnerNoShow },
        booking: { cancelCutoffHours: n(v.booking.cancelCutoffHours), maxSessionsPerDay: n(v.booking.maxSessionsPerDay), minLeadMinutes: n(v.booking.minLeadMinutes), maxAdvanceDays: n(v.booking.maxAdvanceDays) },
        reminders: { expiryDays: String(v.reminders.expiryDays).split(',').map((x) => n(x.trim())).filter(Boolean), sessionMinutes: n(v.reminders.sessionMinutes) },
        renewal: { windowDays: n(v.renewal.windowDays), remainingDays: n(v.renewal.remainingDays) },
      });
      toast.success('Settings saved');
      setF(null);
      reload();
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} noValidate>
      <PageHead title="Settings" description="Every pricing, payout and attendance rule lives here — nothing is hardcoded.">
        <button type="submit" className="btn" disabled={busy}>{busy && <span className="spinner" aria-hidden />} Save settings</button>
      </PageHead>
      {err && <div style={{ marginBottom: 16 }}><Alert>{err}</Alert></div>}
      <div className="settings-grid">
        <section className="panel-card panel-card-body">
          <h2 style={{ fontSize: '1.3rem' }}>Pricing & payouts</h2>
          <Num label="Base rate per training day" value={v.dailyRate} onChange={(x) => up('dailyRate', x)} min={0} />
          <div style={{ marginTop: 14 }}><Num label="Default trainer payout per eligible session" hint="Individual trainers can override this" value={v.trainerPayoutPerSession} onChange={(x) => up('trainerPayoutPerSession', x)} min={0} /></div>
          <div className="form-row" style={{ marginTop: 14 }}>
            <TextField label="Currency" value={v.currency} maxLength={3} onChange={(e) => up('currency', e.target.value.toUpperCase())} />
            <TextField label="Time zone" value={v.timezone} onChange={(e) => up('timezone', e.target.value)} hint="Defines what “a day” means" />
          </div>
          <p className="small muted">Weekly and monthly discounts are set per package under Packages & pricing.</p>
        </section>
        <section className="panel-card panel-card-body">
          <h2 style={{ fontSize: '1.3rem' }}>Completion & attendance policy</h2>
          <div className="form-row">
            <Num label="Min. presence each (% of session)" value={v.policy.minAttendancePct} onChange={(x) => up('policy.minAttendancePct', x)} min={1} max={100} />
            <Num label="Min. time together (%)" value={v.policy.minOverlapPct} onChange={(x) => up('policy.minOverlapPct', x)} min={1} max={100} />
          </div>
          <div className="form-row" style={{ marginTop: 14 }}>
            <Num label="Room opens (min before)" value={v.policy.joinWindowMinutes} onChange={(x) => up('policy.joinWindowMinutes', x)} min={0} />
            <Num label="Evaluate (min after end)" value={v.policy.finalizeGraceMinutes} onChange={(x) => up('policy.finalizeGraceMinutes', x)} min={0} />
          </div>
          <Check label="Count demo-room attendance" hint="Off = only provider-verified attendance counts. Keep off in production unless you accept self-reported joins." checked={v.policy.acceptDemoAttendance} onChange={(x) => up('policy.acceptDemoAttendance', x)} />
          <Check label="Pay trainer when the learner doesn’t show" hint="The learner’s training day is never used in that case." checked={v.policy.payTrainerOnLearnerNoShow} onChange={(x) => up('policy.payTrainerOnLearnerNoShow', x)} />
        </section>
        <section className="panel-card panel-card-body">
          <h2 style={{ fontSize: '1.3rem' }}>Booking rules</h2>
          <div className="form-row">
            <Num label="Cancel/reschedule cut-off (hours)" value={v.booking.cancelCutoffHours} onChange={(x) => up('booking.cancelCutoffHours', x)} min={0} />
            <Num label="Max sessions per learner per day" value={v.booking.maxSessionsPerDay} onChange={(x) => up('booking.maxSessionsPerDay', x)} min={1} />
          </div>
          <div className="form-row" style={{ marginTop: 14 }}>
            <Num label="Minimum lead time (minutes)" value={v.booking.minLeadMinutes} onChange={(x) => up('booking.minLeadMinutes', x)} min={0} />
            <Num label="Book up to (days ahead)" value={v.booking.maxAdvanceDays} onChange={(x) => up('booking.maxAdvanceDays', x)} min={1} />
          </div>
        </section>
        <section className="panel-card panel-card-body">
          <h2 style={{ fontSize: '1.3rem' }}>Reminders & renewal</h2>
          <TextField label="Expiry reminders (days before)" value={v.reminders.expiryDays} onChange={(e) => up('reminders.expiryDays', e.target.value)} hint="Comma separated, e.g. 3, 1" />
          <div className="form-row" style={{ marginTop: 14 }}>
            <Num label="Session reminder (min before)" value={v.reminders.sessionMinutes} onChange={(x) => up('reminders.sessionMinutes', x)} min={5} />
            <Num label="Renew window (days before expiry)" value={v.renewal.windowDays} onChange={(x) => up('renewal.windowDays', x)} min={0} />
          </div>
          <div style={{ marginTop: 14 }}><Num label="…or when this few training days remain" value={v.renewal.remainingDays} onChange={(x) => up('renewal.remainingDays', x)} min={0} /></div>
        </section>
        <section className="panel-card panel-card-body">
          <h2 style={{ fontSize: '1.3rem' }}>Integrations (server environment)</h2>
          <p className="small">Payments: <strong>{titleCase(data.payments.provider)}</strong>{data.payments.provider === 'mock' && ' — development mode, not real money'}</p>
          <p className="small" style={{ marginBottom: 0 }}>Meetings: <strong>{titleCase(data.meetings.provider)}</strong> — {data.meetings.note}</p>
        </section>
      </div>
    </form>
  );
}

// ─── Subscriptions & payments ─────────────────────────────
export function AdminSubscriptions() {
  useSeo({ title: 'Subscriptions', noindex: true });
  const toast = useToast();
  const [cancel, setCancel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);
  const doCancel = async () => {
    setBusy(true);
    try { await api.post(`/admin/subscriptions/${cancel._id}/cancel`, {}); toast.success('Package cancelled'); setCancel(null); setKey((k) => k + 1); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <div>
      <PageHead title="Package usage & expiry" description="Training days used are separate from calendar expiry." />
      <PagedTable
        endpoint="/admin/subscriptions" refreshKey={key} emptyTitle="No packages"
        filters={[{ name: 'phase', label: 'Status', options: ['active', 'expiring', 'expired', 'cancelled'].map((s) => ({ value: s, label: titleCase(s) })) }]}
        columns={[
          { key: 'u', label: 'Learner', render: (s) => <div><div className="cell-title">{s.user?.name}</div><div className="cell-sub">{s.user?.email}</div></div> },
          { key: 'p', label: 'Package', render: (s) => s.packageName },
          { key: 'use', label: 'Days used', render: (s) => `${s.daysUsed} / ${s.trainingDays}${s.reservedDays ? ` (+${s.reservedDays} booked)` : ''}` },
          { key: 'per', label: 'Period', render: (s) => `${formatDate(s.startsAt)} → ${formatDate(s.expiresAt)}` },
          { key: 'st', label: 'Status', render: (s) => <PhaseBadge phase={s.phase} /> },
        ]}
        rowActions={(s) => s.phase !== 'cancelled' && s.phase !== 'expired' && <button type="button" className="icon-btn" onClick={() => setCancel(s)} aria-label="Cancel package" title="Cancel package"><LuTrash2 /></button>}
      />
      <ConfirmDialog open={!!cancel} danger busy={busy} title="Cancel this package?" message="The learner loses access to the remaining days. This does not refund the payment." confirmLabel="Cancel package" onConfirm={doCancel} onCancel={() => setCancel(null)} />
    </div>
  );
}

export function AdminPayments() {
  useSeo({ title: 'Payments', noindex: true });
  return (
    <div>
      <PageHead title="Payments" description="Every payment is verified server-side before a package is activated." />
      <PagedTable
        endpoint="/admin/payments" emptyTitle="No payments yet"
        filters={[{ name: 'status', label: 'Status', options: ['pending', 'paid', 'failed', 'refunded'].map((s) => ({ value: s, label: titleCase(s) })) }]}
        columns={[
          { key: 'u', label: 'Learner', render: (p) => <div><div className="cell-title">{p.user?.name}</div><div className="cell-sub">{p.user?.email}</div></div> },
          { key: 'p', label: 'Package', render: (p) => <div>{p.package?.name}<div className="cell-sub">{p.order?.purchaseMode}</div></div> },
          { key: 'a', label: 'Amount', render: (p) => <div>{formatPrice(p.amount, p.currency)}{p.order?.pricing?.discount > 0 && <div className="cell-sub">after {formatPrice(p.order.pricing.discount, p.currency)} discount</div>}</div> },
          { key: 'pr', label: 'Provider', render: (p) => <div>{titleCase(p.provider)}<div className="cell-sub"><code>{p.transactionId || p.providerOrderId}</code></div></div> },
          { key: 's', label: 'Status', render: (p) => statusBadge(p.status) },
          { key: 'd', label: 'Date', render: (p) => formatDateTime(p.paidAt || p.createdAt) },
        ]}
      />
    </div>
  );
}

// ─── Bookings & attendance ────────────────────────────────
const STATUSES = ['confirmed', 'completed', 'needs_review', 'trainer_no_show', 'learner_no_show', 'technical_failure', 'cancelled_by_learner', 'cancelled_by_trainer', 'cancelled_by_admin'];

export function AdminBookings() {
  useSeo({ title: 'Bookings', noindex: true });
  const toast = useToast();
  const [sp] = useSearchParams();
  const [resolve, setResolve] = useState(null);
  const [cancel, setCancel] = useState(null);
  const [action, setAction] = useState('complete');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [key, setKey] = useState(0);
  const done = () => { setResolve(null); setCancel(null); setNote(''); setErr(''); setKey((k) => k + 1); };

  const doResolve = async () => {
    setBusy(true); setErr('');
    try { await api.post(`/admin/bookings/${resolve._id}/resolve`, { action, note: note || undefined }); toast.success('Session resolved'); done(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const doCancel = async () => {
    setBusy(true); setErr('');
    try { await api.post(`/bookings/${cancel._id}/cancel`, { reason: note || 'Cancelled by administrator' }); toast.success('Booking cancelled'); done(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const reevaluate = async (b, reload) => {
    try { await api.post(`/admin/bookings/${b._id}/reevaluate`); toast.success('Re-evaluated'); reload(); } catch (e) { toast.error(e.message); }
  };

  return (
    <div>
      <PageHead title="Bookings & attendance" description="Monitor every session. Sessions that miss the attendance policy wait here for your decision." />
      <PagedTable
        endpoint="/admin/bookings" refreshKey={key} params={{ status: sp.get('status') || undefined }}
        filters={[{ name: 'status', label: 'Status', options: STATUSES.map((s) => ({ value: s, label: titleCase(s) })) }]}
        emptyTitle="No bookings"
        columns={[
          { key: 'w', label: 'When', render: (b) => <div>{formatDate(b.startAt)}<div className="cell-sub">{formatTime(b.startAt)} – {formatTime(b.endAt)}</div></div> },
          { key: 't', label: 'Trainer', render: (b) => b.trainer?.name },
          { key: 'l', label: 'Learner', render: (b) => <div>{b.learner?.name}<div className="cell-sub">{b.subscription?.packageName}</div></div> },
          { key: 'a', label: 'Attendance', render: (b) => (b.attendance?.trainerMinutes != null ? <div>T {b.attendance.trainerMinutes}m · L {b.attendance.learnerMinutes}m<div className="cell-sub">together {b.attendance.overlapMinutes}m{b.attendance.usedDemoEvents ? ' · demo' : ''}</div></div> : '—') },
          { key: 's', label: 'Status', render: (b) => <div><BookingBadge status={b.status} />{b.outcome?.reason && b.status !== 'confirmed' && <div className="cell-sub">{b.outcome.reason}</div>}</div> },
        ]}
        rowActions={(b, { reload }) => (
          <>
            {['needs_review', 'trainer_no_show', 'learner_no_show'].includes(b.status) && <button type="button" className="btn btn-outline btn-sm" onClick={() => { setErr(''); setAction('complete'); setResolve(b); }}>Resolve</button>}
            {b.status === 'confirmed' && new Date(b.endAt) < new Date() && <button type="button" className="btn btn-outline btn-sm" onClick={() => reevaluate(b, reload)}>Evaluate now</button>}
            {b.status === 'confirmed' && new Date(b.startAt) > new Date() && <button type="button" className="icon-btn" onClick={() => { setErr(''); setCancel(b); }} aria-label="Cancel booking" title="Cancel"><LuTrash2 /></button>}
          </>
        )}
      />
      <Modal open={!!resolve} onClose={done} size="sm" title="Resolve session"
        footer={<><button type="button" className="btn btn-outline btn-sm" onClick={done}>Cancel</button><button type="button" className="btn btn-sm" disabled={busy} onClick={doResolve}>{busy && <span className="spinner" aria-hidden />} Apply decision</button></>}>
        {resolve && <p style={{ marginTop: 0 }} className="small muted">{resolve.trainer?.name} with {resolve.learner?.name}, {formatDateTime(resolve.startAt)}. {resolve.outcome?.reason}</p>}
        {err && <div style={{ marginBottom: 12 }}><Alert>{err}</Alert></div>}
        <div className="field">
          <label className="label" htmlFor="res-action">Decision</label>
          <select id="res-action" className="select" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="complete">Completed — use a training day and create the trainer earning</option>
            <option value="technical_failure">Technical failure — no day used, no earning</option>
            <option value="trainer_no_show">Trainer no-show</option>
            <option value="learner_no_show">Learner no-show</option>
          </select>
        </div>
        <TextField label="Note (recorded in the audit log)" multiline rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
      </Modal>
      <Modal open={!!cancel} onClose={done} size="sm" title="Cancel this booking"
        footer={<><button type="button" className="btn btn-outline btn-sm" onClick={done}>Keep</button><button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={doCancel}>{busy && <span className="spinner" aria-hidden />} Cancel booking</button></>}>
        {err && <div style={{ marginBottom: 12 }}><Alert>{err}</Alert></div>}
        <p style={{ marginTop: 0 }}>Both people are notified and the learner keeps their training day.</p>
        <TextField label="Reason" multiline rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
      </Modal>
    </div>
  );
}

// ─── Session report ───────────────────────────────────────
function csvEscape(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

export function AdminReport() {
  useSeo({ title: 'Session report', noindex: true });
  const [range, setRange] = useState({ from: '', to: '' });
  const [rows, setRows] = useState([]);
  const exportCsv = () => {
    const head = ['Start', 'Trainer', 'Learner', 'Package', 'Status', 'Trainer min', 'Learner min', 'Together min', 'Attendance source', 'Day used', 'Earning', 'Earning status'];
    const lines = rows.map((b) => [b.startAt, b.trainer?.name, b.learner?.name, b.subscription?.packageName, b.status, b.attendance?.trainerMinutes, b.attendance?.learnerMinutes, b.attendance?.overlapMinutes, b.attendance?.usedDemoEvents ? 'demo' : 'verified', b.usage?.counted ? 'yes' : 'no', b.earning?.amount, b.earning?.status].map(csvEscape).join(','));
    const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'session-report.csv'; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div>
      <PageHead title="Session report" description="Booking → attendance → learner usage → trainer earning, in one view.">
        <button type="button" className="btn btn-outline btn-sm" onClick={exportCsv} disabled={!rows.length}><LuDownload /> Export this page (CSV)</button>
      </PageHead>
      <div className="form-row" style={{ maxWidth: 520 }}>
        <TextField label="From" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <TextField label="To" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
      </div>
      <PagedTable
        endpoint="/admin/reports/sessions" params={{ from: range.from || undefined, to: range.to || undefined }} emptyTitle="No sessions in this range"
        filters={[{ name: 'status', label: 'Status', options: STATUSES.map((s) => ({ value: s, label: titleCase(s) })) }]}
        onLoaded={({ data }) => setRows(data)}
        columns={[
          { key: 'w', label: 'Session', render: (b) => <div>{formatDateTime(b.startAt)}<div className="cell-sub">{b.trainer?.name} → {b.learner?.name}</div></div> },
          { key: 'a', label: 'Attendance', render: (b) => (b.attendance?.trainerMinutes != null ? <div>T {b.attendance.trainerMinutes}m / L {b.attendance.learnerMinutes}m<div className="cell-sub">{b.events.length} event(s){b.attendance.usedDemoEvents ? ' · includes demo' : ' · verified'}</div></div> : <span className="muted">{b.events.length} event(s)</span>) },
          { key: 's', label: 'Outcome', render: (b) => <BookingBadge status={b.status} /> },
          { key: 'u', label: 'Learner usage', render: (b) => (b.usage.counted ? <span className="badge badge-success">1 day used ({b.usage.dayKey})</span> : <span className="muted">Not used</span>) },
          { key: 'e', label: 'Trainer earning', render: (b) => (b.earning ? <div>{formatPrice(b.earning.amount, 'INR')} <EarningBadge status={b.earning.status} /></div> : <span className="muted">None</span>) },
        ]}
      />
    </div>
  );
}

// ─── Payouts ──────────────────────────────────────────────
export function AdminPayouts() {
  useSeo({ title: 'Trainer payouts', noindex: true });
  const toast = useToast();
  const [selected, setSelected] = useState([]);
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({});
  const [dialog, setDialog] = useState(null); // 'approve' | 'paid' | 'failed' | 'reopen'
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [key, setKey] = useState(0);

  const picked = rows.filter((r) => selected.includes(r._id));
  const sum = picked.reduce((s, r) => s + r.amount, 0);
  const allStatus = picked.length ? [...new Set(picked.map((p) => p.status))] : [];
  const single = allStatus.length === 1 ? allStatus[0] : null;

  const run = async () => {
    setBusy(true); setErr('');
    const path = { approve: 'approve', paid: 'mark-paid', failed: 'mark-failed', reopen: 'reopen' }[dialog];
    try {
      await api.post(`/admin/payouts/${path}`, { ids: selected, ...(dialog === 'paid' ? { reference: text || undefined } : {}), ...(dialog === 'failed' ? { reason: text || undefined } : {}) });
      toast.success('Payout records updated');
      setDialog(null); setText(''); setSelected([]); setKey((k) => k + 1);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const cur = 'INR';

  return (
    <div>
      <PageHead title="Trainer payouts" description="Approve earnings, then record when you have paid the trainer. This system tracks payouts — it does not transfer money." />
      <div className="stats">
        <Stat label="Pending" value={formatPrice(totals.pending?.amount || 0, cur)} sub={`${totals.pending?.count || 0} earning(s)`} />
        <Stat label="Approved" value={formatPrice(totals.approved?.amount || 0, cur)} sub={`${totals.approved?.count || 0} to pay`} />
        <Stat label="Paid" value={formatPrice(totals.paid?.amount || 0, cur)} sub={`${totals.paid?.count || 0} paid`} />
        <Stat label="Failed" value={formatPrice(totals.failed?.amount || 0, cur)} sub={`${totals.failed?.count || 0}`} />
      </div>
      <PagedTable
        endpoint="/admin/payouts" refreshKey={key} pageSize={20} emptyTitle="No earnings yet" empty="Earnings are created when a session is completed."
        filters={[{ name: 'status', label: 'Status', options: ['pending', 'approved', 'paid', 'failed'].map((s) => ({ value: s, label: titleCase(s) })) }]}
        selectable selected={selected} onSelectedChange={setSelected}
        onLoaded={({ data, meta }) => { setRows(data); if (meta.totals) setTotals(meta.totals); }}
        toolbar={() => (
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-sm" disabled={single !== 'pending'} onClick={() => { setErr(''); setDialog('approve'); }}>Approve</button>
            <button type="button" className="btn btn-sm" disabled={single !== 'approved'} onClick={() => { setErr(''); setDialog('paid'); }}>Mark paid</button>
            <button type="button" className="btn btn-outline btn-sm" disabled={!['pending', 'approved'].includes(single)} onClick={() => { setErr(''); setDialog('failed'); }}>Mark failed</button>
            <button type="button" className="btn btn-outline btn-sm" disabled={single !== 'failed'} onClick={() => { setErr(''); setDialog('reopen'); }}>Reopen</button>
            {!!selected.length && <span className="small muted">{selected.length} selected · {formatPrice(sum, cur)}</span>}
          </div>
        )}
        columns={[
          { key: 't', label: 'Trainer', render: (e) => <div><div className="cell-title">{e.trainer?.name}</div><div className="cell-sub">{e.trainer?.email}</div></div> },
          { key: 's', label: 'Session', render: (e) => <div>{formatDateTime(e.sessionAt)}<div className="cell-sub">with {e.learner?.name || '—'}{e.reason !== 'completed' ? ` · ${titleCase(e.reason)}` : ''}</div></div> },
          { key: 'a', label: 'Amount', render: (e) => formatPrice(e.amount, e.currency) },
          { key: 'st', label: 'Status', render: (e) => <div><EarningBadge status={e.status} />{e.failureReason && <div className="cell-sub">{e.failureReason}</div>}{e.payoutReference && <div className="cell-sub">Ref {e.payoutReference}</div>}</div> },
        ]}
      />
      <Modal open={!!dialog} onClose={() => setDialog(null)} size="sm"
        title={{ approve: 'Approve payouts', paid: 'Mark as paid', failed: 'Mark as failed', reopen: 'Reopen payouts' }[dialog] || ''}
        footer={<><button type="button" className="btn btn-outline btn-sm" onClick={() => setDialog(null)}>Cancel</button><button type="button" className="btn btn-sm" disabled={busy} onClick={run}>{busy && <span className="spinner" aria-hidden />} Confirm</button></>}>
        {err && <div style={{ marginBottom: 12 }}><Alert>{err}</Alert></div>}
        <p style={{ marginTop: 0 }}>{selected.length} earning(s), {formatPrice(sum, cur)} in total.</p>
        {dialog === 'paid' && <><Alert type="warning">Only mark as paid after you have actually paid the trainer (bank, UPI, …). This software does not move money.</Alert><div style={{ marginTop: 12 }}><TextField label="Payment reference (optional)" value={text} onChange={(e) => setText(e.target.value)} placeholder="UTR / transaction ID" /></div></>}
        {dialog === 'failed' && <TextField label="Reason" value={text} onChange={(e) => setText(e.target.value)} />}
      </Modal>
    </div>
  );
}

// ─── Notifications broadcast ──────────────────────────────
export function AdminBroadcast() {
  useSeo({ title: 'Send notification', noindex: true });
  const toast = useToast();
  const [f, setF] = useState({ title: '', message: '', link: '', role: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/notifications/broadcast', { title: f.title, message: f.message, link: f.link || undefined, role: f.role || undefined });
      toast.success(`Sent to ${data.sent} user(s)`);
      setF({ title: '', message: '', link: '', role: '' });
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };
  return (
    <div style={{ maxWidth: 640 }}>
      <PageHead title="Send a notification" description="Delivered in-app to the chosen audience." />
      <form className="panel-card panel-card-body" onSubmit={send} noValidate>
        {err && <div style={{ marginBottom: 14 }}><Alert>{err}</Alert></div>}
        <TextField label="Title" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <div style={{ marginTop: 14 }}><TextField label="Message" multiline rows={3} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></div>
        <div className="form-row" style={{ marginTop: 14 }}>
          <TextField label="Link (optional)" placeholder="/dashboard/plans" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} />
          <div className="field">
            <label className="label" htmlFor="bc-role">Audience</label>
            <select id="bc-role" className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="">Everyone</option><option value="learner">Learners</option><option value="trainer">Trainers</option>
            </select>
          </div>
        </div>
        <button type="submit" className="btn" style={{ marginTop: 18 }} disabled={busy || !f.title.trim()}>{busy && <span className="spinner" aria-hidden />} Send</button>
      </form>
    </div>
  );
}

// ─── Learner feedback ─────────────────────────────────────
export function AdminFeedback() {
  useSeo({ title: 'Learner feedback', noindex: true });
  const trainers = useFetch('/admin/trainers', { limit: 100 });
  const [trainer, setTrainer] = useState('');
  const [avg, setAvg] = useState(null);
  return (
    <div>
      <PageHead title="Learner feedback" description="Ratings and comments learners give trainers after completed sessions.">
        {avg !== null && <span className="badge badge-gold">Average {avg} / 5</span>}
      </PageHead>
      <div className="rm-toolbar">
        <label>
          <span className="sr-only">Trainer</span>
          <select className="select" value={trainer} onChange={(e) => setTrainer(e.target.value)}>
            <option value="">Trainer: All</option>
            {(trainers.data || []).map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
        </label>
      </div>
      <PagedTable
        endpoint="/admin/feedback"
        params={{ trainer: trainer || undefined }}
        searchable
        searchPlaceholder="Search comments…"
        emptyTitle="No feedback yet"
        empty="Feedback appears after learners rate completed sessions."
        filters={[{ name: 'rating', label: 'Rating', options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n === 1 ? '' : 's'}` })) }]}
        onLoaded={({ meta }) => setAvg(meta.average ?? null)}
        columns={[
          { key: 'd', label: 'Date', render: (f) => formatDateTime(f.createdAt) },
          { key: 't', label: 'Trainer', render: (f) => f.trainer?.name },
          { key: 'l', label: 'Learner', render: (f) => <div>{f.learner?.name}<div className="cell-sub">{f.learner?.email}</div></div> },
          { key: 'r', label: 'Rating', render: (f) => <span className="badge badge-gold">{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</span> },
          { key: 'c', label: 'Comment', render: (f) => f.comment || <span className="muted">—</span> },
          { key: 's', label: 'Session', render: (f) => (f.booking?.startAt ? formatDateTime(f.booking.startAt) : '—') },
        ]}
      />
    </div>
  );
}
