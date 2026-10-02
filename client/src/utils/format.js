const CURRENCY_LOCALE = { INR: 'en-IN', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB' };

export function formatPrice(amount, currency = 'INR') {
  if (!amount) return 'Free';
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALE[currency] || 'en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 1 ? 2 : 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export const formatDate = (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  d ? new Intl.DateTimeFormat('en-IN', opts).format(new Date(d)) : '';

export const formatTime = (d) =>
  d ? new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(d)) : '';

export const formatDateTime = (d) => (d ? `${formatDate(d)}, ${formatTime(d)}` : '');

export function formatDuration(minutes = 0) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "Starts in 2 hours", "Starts in 3 days", "Starting now" */
export function relativeStart(date, now = Date.now()) {
  const diff = new Date(date).getTime() - now;
  if (diff <= 0) return 'Starting now';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `Starts in ${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Starts in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `Starts in ${days} day${days === 1 ? '' : 's'}`;
}

export function timeAgo(date) {
  const s = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return formatDate(date);
}

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || 'A';

export const LEVEL_LABEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', all: 'All levels' };

export const titleCase = (s = '') => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Session state computed client-side (mirrors the API virtual). */
export function sessionState(s, now = Date.now()) {
  if (s.state) return s.state;
  if (s.liveStatus === 'ended') return 'completed';
  if (s.liveStatus === 'live') return 'live';
  if (now > new Date(s.endAt).getTime()) return 'completed';
  if (now >= new Date(s.startAt).getTime()) return 'live';
  return 'upcoming';
}

/** For datetime-local inputs */
export function toLocalInput(d) {
  if (!d) return '';
  const date = new Date(d);
  const off = date.getTimezoneOffset();
  return new Date(date.getTime() - off * 60000).toISOString().slice(0, 16);
}
