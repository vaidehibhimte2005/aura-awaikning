/** Timezone helpers. All instants are stored in UTC; "a day" is defined in the configured timezone. */

function partsIn(date, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return o;
}

/** Offset of `tz` from UTC at the given instant, in ms (e.g. +5.5h for Asia/Kolkata). */
export function tzOffsetMs(date, tz) {
  const o = partsIn(date, tz);
  const asUtc = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** "2026-03-05" + "09:30" in `tz` → the UTC Date for that wall-clock time. */
export function zonedToUtc(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  let result = guess - tzOffsetMs(new Date(guess), tz);
  // Re-check once so dates next to a DST change resolve correctly.
  result = guess - tzOffsetMs(new Date(result), tz);
  return new Date(result);
}

/** YYYY-MM-DD calendar date of an instant in `tz`. */
export function dayKeyOf(date, tz) {
  const o = partsIn(new Date(date), tz);
  return `${o.year}-${o.month}-${o.day}`;
}

export const addMinutes = (date, min) => new Date(new Date(date).getTime() + min * 60000);
export const addDays = (date, days) => new Date(new Date(date).getTime() + days * 86400000);
export const minutesBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);
