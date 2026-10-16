import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCalendarDays, LuCalendarPlus, LuIndianRupee, LuTrash2, LuX } from 'react-icons/lu';
import { useFetch } from '../hooks/useFetch.js';
import { useSeo } from '../hooks/useSeo.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../services/api.js';
import { ConfirmDialog } from '../components/Modal.jsx';
import { Alert, AsyncBlock, EmptyState, ErrorState, Loader } from '../components/States.jsx';
import { Field, TextField } from '../components/Form.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { formatDate, formatDateTime, formatPrice, formatTime } from '../utils/format.js';
import { BookingCard } from './BookingCard.jsx';
import { DemoNotice, EarningBadge, PageHead, Stat, localDayKey, todayKey } from './common.jsx';

export function TrainerHome() {
  useSeo({ title: 'Trainer dashboard', noindex: true });
  const { user } = useAuth();
  const upcoming = useFetch('/bookings/me', { when: 'upcoming', limit: 5 });
  const slots = useFetch('/slots/mine');
  const earnings = useFetch('/trainer/earnings', { limit: 1 });
  const open = (slots.data || []).filter((s) => s.status === 'available').length;
  const totals = earnings.meta?.totals || {};
  const cur = earnings.meta?.currency || 'INR';
  return (
    <div>
      <PageHead title={`Welcome, ${user.name.split(' ')[0]}`} description="Your upcoming sessions, availability and earnings.">
        <Link to="/trainer/slots" className="btn"><LuCalendarPlus /> Publish slots</Link>
      </PageHead>
      <div className="stats">
        <Stat label="Upcoming sessions" value={upcoming.meta?.total ?? '—'} icon={LuCalendarDays} />
        <Stat label="Open slots" value={slots.data ? open : '—'} sub="Published and unbooked" />
        <Stat label="Pending earnings" value={formatPrice(totals.pending?.amount || 0, cur)} icon={LuIndianRupee} sub="Awaiting admin approval" />
        <Stat label="Paid out" value={formatPrice(totals.paid?.amount || 0, cur)} sub={`${totals.paid?.count || 0} session(s)`} />
      </div>
      {open === 0 && slots.data && <div style={{ marginBottom: 20 }}><Alert type="info">You have no open slots, so learners cannot book you. <Link to="/trainer/slots">Publish your availability</Link>.</Alert></div>}
      <section className="panel-card">
        <div className="panel-card-head"><h2>Next sessions</h2><Link to="/trainer/bookings" className="btn btn-text btn-sm">All bookings</Link></div>
        <div className="panel-card-body">
          <AsyncBlock loading={upcoming.loading && !upcoming.data} error={upcoming.error} onRetry={upcoming.reload} empty={!upcoming.data?.length} emptyState={<p className="muted" style={{ margin: 0 }}>No upcoming bookings yet.</p>}>
            <div className="booking-list">{upcoming.data?.map((b) => <BookingCard key={b._id} b={b} role="trainer" onChanged={upcoming.reload} />)}</div>
          </AsyncBlock>
        </div>
      </section>
    </div>
  );
}

export function TrainerSlots() {
  useSeo({ title: 'My availability', noindex: true });
  const toast = useToast();
  const cfg = useFetch('/packages');
  const slots = useFetch('/slots/mine');
  const [dates, setDates] = useState([]);
  const [dateInput, setDateInput] = useState('');
  const [form, setForm] = useState({ startTime: '09:00', endTime: '13:00', durationMin: 60, gapMin: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fieldErr, setFieldErr] = useState({});
  const [del, setDel] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  const tz = cfg.data?.config?.timezone || 'Asia/Kolkata';

  const addDate = (d) => { if (d && !dates.includes(d)) setDates((x) => [...x, d].sort()); };
  const addNextDays = (n) => setDates((x) => [...new Set([...x, ...Array.from({ length: n }, (_, i) => todayKey(i + 1))])].sort());

  const count = useMemo(() => {
    const [sh, sm] = form.startTime.split(':').map(Number);
    const [eh, em] = form.endTime.split(':').map(Number);
    const total = (eh * 60 + em) - (sh * 60 + sm);
    const dur = Number(form.durationMin) || 0;
    const gap = Number(form.gapMin) || 0;
    if (total <= 0 || dur < 15) return 0;
    return Math.floor((total + gap) / (dur + gap));
  }, [form]);

  const publish = async (e) => {
    e.preventDefault();
    setErr('');
    setFieldErr({});
    if (!dates.length) return setErr('Add at least one date.');
    if (!count) return setErr('That time range is too short for a session of this length.');
    setBusy(true);
    try {
      const { data } = await api.post('/slots', { dates, startTime: form.startTime, endTime: form.endTime, durationMin: Number(form.durationMin), gapMin: Number(form.gapMin) });
      toast.success(`Published ${data.count} slot${data.count === 1 ? '' : 's'}`);
      setDates([]);
      slots.reload();
    } catch (ex) {
      setErr(ex.message);
      setFieldErr(ex.fieldErrors || {});
    } finally { setBusy(false); }
    return null;
  };

  const remove = async () => {
    setDelBusy(true);
    try { await api.delete(`/slots/${del._id}`); toast.success('Slot removed'); setDel(null); slots.reload(); } catch (ex) { toast.error(ex.message); setDel(null); } finally { setDelBusy(false); }
  };

  const grouped = useMemo(() => {
    const m = new Map();
    (slots.data || []).forEach((s) => { const k = localDayKey(s.start); m.set(k, [...(m.get(k) || []), s]); });
    return [...m.entries()];
  }, [slots.data]);

  return (
    <div>
      <PageHead title="My availability" description="Publish the times you can teach. Learners book them directly — bookings are confirmed automatically." />
      <form className="panel-card panel-card-body" onSubmit={publish} noValidate style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: '1.4rem' }}>Publish slots</h2>
        {err && <div style={{ marginBottom: 14 }}><Alert>{err}</Alert></div>}
        <Field label="Dates" required hint={`Pick one or more dates. Times below are in ${tz}.`} error={fieldErr.dates}>
          {(a11y) => (
            <div>
              <div className="list-editor-row">
                <input {...a11y} className="input" type="date" min={todayKey(0)} value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { addDate(dateInput); setDateInput(''); }}>Add date</button>
                <button type="button" className="btn btn-text btn-sm" onClick={() => addNextDays(7)}>Next 7 days</button>
              </div>
              {!!dates.length && (
                <div className="chips" style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {dates.map((d) => (
                    <span key={d} className="badge badge-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {formatDate(`${d}T12:00:00`, { weekday: 'short', day: 'numeric', month: 'short' })}
                      <button type="button" className="icon-btn" style={{ width: 18, height: 18 }} onClick={() => setDates(dates.filter((x) => x !== d))} aria-label={`Remove ${d}`}><LuX size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </Field>
        <div className="form-row" style={{ marginTop: 16 }}>
          <TextField label="First session starts" type="time" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} error={fieldErr.startTime} />
          <TextField label="Last session ends by" type="time" required value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} error={fieldErr.endTime} />
        </div>
        <div className="form-row">
          <TextField label="Session length (minutes)" type="number" min={15} max={240} step={5} required value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} error={fieldErr.durationMin} />
          <TextField label="Break between sessions (minutes)" type="number" min={0} max={120} step={5} value={form.gapMin} onChange={(e) => setForm({ ...form, gapMin: e.target.value })} />
        </div>
        <p className="muted small" style={{ margin: '8px 0 16px' }}>
          {count ? `This creates ${count} session${count === 1 ? '' : 's'} per day${dates.length ? ` — ${count * dates.length} in total` : ''}.` : 'Choose a time range long enough for at least one session.'} Overlapping slots are rejected.
        </p>
        <button type="submit" className="btn" disabled={busy}>{busy && <span className="spinner" aria-hidden />} Publish slots</button>
      </form>

      <h2 style={{ fontSize: '1.4rem' }}>Upcoming slots</h2>
      {slots.error ? <ErrorState error={slots.error} onRetry={slots.reload} /> : slots.loading && !slots.data ? <Loader /> : !grouped.length ? (
        <EmptyState icon={LuCalendarDays} title="No slots published" message="Use the form above to publish your availability." />
      ) : grouped.map(([day, list]) => (
        <section className="panel-card" key={day} style={{ marginBottom: 14 }}>
          <div className="panel-card-head"><h2 style={{ fontSize: '1.1rem' }}>{formatDate(`${day}T12:00:00`, { weekday: 'long', day: 'numeric', month: 'long' })}</h2></div>
          <div className="panel-card-body">
            <div className="slot-grid">
              {list.map((s) => (
                <div key={s._id} className={`slot-btn${s.status === 'booked' ? ' is-booked' : ''}`} style={{ cursor: 'default' }}>
                  <b>{formatTime(s.start)} – {formatTime(s.end)}</b>
                  {s.status === 'booked' ? <small>Booked{s.booking?.learner ? ` · ${s.booking.learner.name}` : ''}</small> : <small>Open</small>}
                  {s.status === 'available' && (
                    <button type="button" className="icon-btn" onClick={() => setDel(s)} aria-label={`Remove slot ${formatTime(s.start)}`} style={{ justifySelf: 'center' }}><LuTrash2 size={16} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
      <p className="small muted">Booked slots can’t be deleted. To cancel a booking, open it under <Link to="/trainer/bookings">Bookings</Link> and give the learner a reason so they can rebook.</p>

      <ConfirmDialog open={!!del} danger busy={delBusy} title="Remove this slot?" message={del && `${formatDateTime(del.start)} will no longer be available to learners.`} confirmLabel="Remove slot" onConfirm={remove} onCancel={() => setDel(null)} />
    </div>
  );
}

export function TrainerBookings() {
  useSeo({ title: 'Bookings', noindex: true });
  const [tab, setTab] = useState('upcoming');
  const { data, loading, error, reload } = useFetch('/bookings/me', { when: tab, limit: 50 });
  const anyDemo = data?.some((b) => b.meeting?.isDemo);
  return (
    <div>
      <PageHead title="Bookings" description="Learners book your published slots; each booking is already confirmed." />
      {anyDemo && <DemoNotice />}
      <div className="tabs" role="tablist" aria-label="Booking filter">
        {['upcoming', 'past'].map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t === 'upcoming' ? 'Upcoming' : 'Previous'}</button>)}
      </div>
      <AsyncBlock loading={loading && !data} error={error} onRetry={reload} empty={!data?.length} emptyState={<EmptyState icon={LuCalendarDays} title={tab === 'upcoming' ? 'No upcoming bookings' : 'No previous bookings'} message={tab === 'upcoming' ? 'Publish slots so learners can book you.' : undefined} action={tab === 'upcoming' ? <Link to="/trainer/slots" className="btn btn-sm">Publish slots</Link> : null} />}>
        <div className="booking-list">{data?.map((b) => <BookingCard key={b._id} b={b} role="trainer" onChanged={reload} />)}</div>
      </AsyncBlock>
    </div>
  );
}

export function TrainerEarnings() {
  useSeo({ title: 'Earnings', noindex: true });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { data, meta, loading, error, reload } = useFetch('/trainer/earnings', { page, limit: 20, status: status || undefined });
  const profile = useFetch('/trainer/profile');
  const cur = meta?.currency || 'INR';
  const totals = meta?.totals || {};
  return (
    <div>
      <PageHead title="Earnings & payouts" description="You earn once for each eligible, completed session. Only an administrator can approve a payout or mark it paid." />
      <div className="stats">
        <Stat label="Pending" value={formatPrice(totals.pending?.amount || 0, cur)} sub={`${totals.pending?.count || 0} awaiting approval`} />
        <Stat label="Approved" value={formatPrice(totals.approved?.amount || 0, cur)} sub={`${totals.approved?.count || 0} awaiting payment`} />
        <Stat label="Paid" value={formatPrice(totals.paid?.amount || 0, cur)} sub={`${totals.paid?.count || 0} paid`} />
        <Stat label="Rate per session" value={profile.data ? formatPrice(profile.data.payoutPerSession, cur) : '—'} sub="Set by an administrator" />
      </div>
      <div className="tabs" role="tablist" aria-label="Status filter">
        {['', 'pending', 'approved', 'paid', 'failed'].map((s) => <button key={s || 'all'} type="button" role="tab" aria-selected={status === s} onClick={() => { setStatus(s); setPage(1); }}>{s ? s[0].toUpperCase() + s.slice(1) : 'All'}</button>)}
      </div>
      <AsyncBlock loading={loading && !data} error={error} onRetry={reload} empty={!data?.length} emptyState={<EmptyState icon={LuIndianRupee} title="No earnings yet" message="Earnings appear after a session is completed under the attendance policy." />}>
        <div className="table-wrap">
          <table className="table table-responsive">
            <thead><tr><th>Session</th><th>Learner</th><th>Amount</th><th>Status</th><th>Paid on</th></tr></thead>
            <tbody>
              {data?.map((e) => (
                <tr key={e._id}>
                  <td data-label="Session">{formatDateTime(e.sessionAt)}</td>
                  <td data-label="Learner">{e.learner?.name || '—'}</td>
                  <td data-label="Amount">{formatPrice(e.amount, e.currency)}</td>
                  <td data-label="Status"><EarningBadge status={e.status} />{e.failureReason && <div className="cell-sub">{e.failureReason}</div>}</td>
                  <td data-label="Paid on">{e.paidAt ? <>{formatDate(e.paidAt)}{e.payoutReference && <div className="cell-sub">Ref: {e.payoutReference}</div>}</> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AsyncBlock>
      {meta && <Pagination page={meta.page} pages={meta.pages} onChange={setPage} />}
    </div>
  );
}

export function TrainerProfile() {
  useSeo({ title: 'Profile', noindex: true });
  const toast = useToast();
  const { data, loading, error, reload } = useFetch('/trainer/profile');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fe, setFe] = useState({});
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <Loader />;
  const f = form || {
    displayName: data.profile.displayName || '', title: data.profile.title || '', shortBio: data.profile.shortBio || '', bio: data.profile.bio || '',
    specialties: (data.profile.specialties || []).join(', '), languages: (data.profile.languages || []).join(', '),
    experienceYears: data.profile.experienceYears || 0, phone: data.user.phone || '',
  };
  const set = (k) => (e) => setForm({ ...f, [k]: e.target.value });
  const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(''); setFe({});
    try {
      await api.patch('/trainer/profile', { displayName: f.displayName, title: f.title, shortBio: f.shortBio, bio: f.bio, specialties: list(f.specialties), languages: list(f.languages), experienceYears: Number(f.experienceYears) || 0, ...(f.phone ? { phone: f.phone } : {}) });
      toast.success('Profile saved');
      reload();
    } catch (ex) { setErr(ex.message); setFe(ex.fieldErrors || {}); } finally { setBusy(false); }
  };
  return (
    <div style={{ maxWidth: 760 }}>
      <PageHead title="My profile" description="This is what learners see when choosing a trainer. Your login email and payout rate are managed by an administrator." />
      <form className="panel-card panel-card-body" onSubmit={save} noValidate>
        {err && <div style={{ marginBottom: 16 }}><Alert>{err}</Alert></div>}
        <div className="form-row">
          <TextField label="Display name" required value={f.displayName} onChange={set('displayName')} error={fe.displayName} />
          <TextField label="Email" value={data.user.email} disabled hint="Contact an administrator to change" />
        </div>
        <div className="form-row">
          <TextField label="Headline" value={f.title} onChange={set('title')} error={fe.title} placeholder="e.g. Meditation & breathwork guide" />
          <TextField label="Mobile number" type="tel" value={f.phone} onChange={set('phone')} error={fe.phone} />
        </div>
        <TextField label="Short bio" multiline rows={2} maxLength={240} value={f.shortBio} onChange={set('shortBio')} error={fe.shortBio} />
        <div style={{ marginTop: 16 }}><TextField label="About you" multiline rows={5} value={f.bio} onChange={set('bio')} error={fe.bio} /></div>
        <div className="form-row" style={{ marginTop: 16 }}>
          <TextField label="Specialties" value={f.specialties} onChange={set('specialties')} hint="Comma separated" />
          <TextField label="Languages" value={f.languages} onChange={set('languages')} hint="Comma separated" />
        </div>
        <TextField label="Years of experience" type="number" min={0} max={80} value={f.experienceYears} onChange={set('experienceYears')} />
        <p className="small muted">Payout per completed session: <strong>{formatPrice(data.payoutPerSession, data.currency)}</strong> (set by an administrator).</p>
        <button type="submit" className="btn" disabled={busy}>{busy && <span className="spinner" aria-hidden />} Save changes</button>
      </form>
    </div>
  );
}
