import { LuTriangleAlert } from 'react-icons/lu';
import { formatDate, formatTime, titleCase } from '../utils/format.js';

export const BOOKING_BADGE = {
  confirmed: 'badge-gold',
  completed: 'badge-success',
  needs_review: 'badge-warning',
  trainer_no_show: 'badge-danger',
  learner_no_show: 'badge-danger',
  technical_failure: 'badge-muted',
  cancelled_by_learner: 'badge-muted',
  cancelled_by_trainer: 'badge-muted',
  cancelled_by_admin: 'badge-muted',
};

export const BOOKING_LABEL = {
  confirmed: 'Confirmed',
  completed: 'Completed',
  needs_review: 'Under review',
  trainer_no_show: 'Trainer no-show',
  learner_no_show: 'Learner no-show',
  technical_failure: 'Technical failure',
  cancelled_by_learner: 'Cancelled by learner',
  cancelled_by_trainer: 'Cancelled by trainer',
  cancelled_by_admin: 'Cancelled by admin',
};

export const BookingBadge = ({ status }) => <span className={`badge ${BOOKING_BADGE[status] || ''}`}>{BOOKING_LABEL[status] || titleCase(status)}</span>;

export const PHASE_BADGE = { active: 'badge-success', upcoming: 'badge-gold', exhausted: 'badge-warning', expired: 'badge-muted', cancelled: 'badge-danger' };
export const PhaseBadge = ({ phase }) => <span className={`badge ${PHASE_BADGE[phase] || ''}`}>{titleCase(phase || '—')}</span>;

export const EARNING_BADGE = { pending: 'badge-warning', approved: 'badge-gold', paid: 'badge-success', failed: 'badge-danger' };
export const EarningBadge = ({ status }) => <span className={`badge ${EARNING_BADGE[status] || ''}`}>{titleCase(status)}</span>;

export const fmtDay = (d) => formatDate(d, { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtSlot = (s) => `${fmtDay(s.start || s.startAt)}, ${formatTime(s.start || s.startAt)} – ${formatTime(s.end || s.endAt)}`;

/** Local YYYY-MM-DD key for grouping slots by day. */
export const localDayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export const todayKey = (offsetDays = 0) => localDayKey(new Date(Date.now() + offsetDays * 86400000));

export function DemoNotice({ children }) {
  return (
    <div className="alert alert-warning" role="note" style={{ marginBottom: 16 }}>
      <LuTriangleAlert size={16} aria-hidden />
      <div>{children || 'Demo mode: meeting links open a demo room, not a real video call, and attendance recorded there is labelled demo.'}</div>
    </div>
  );
}

export function PageHead({ title, description, children }) {
  return (
    <div className="panel-head">
      <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, icon: Icon }) {
  return (
    <div className="stat">
      <span className="stat-label">{label} {Icon && <Icon aria-hidden />}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}
