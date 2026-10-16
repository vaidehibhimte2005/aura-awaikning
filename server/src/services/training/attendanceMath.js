/**
 * Pure attendance / completion-policy logic (no database) so the business rules
 * that decide whether a training day is consumed and a trainer is paid can be
 * unit-tested in isolation.
 */

/**
 * Turns an ordered list of join/leave events (one participant) into presence
 * intervals clipped to the session window. A join with no later leave is assumed
 * to last until the session end (the provider did not report the departure).
 * Duplicate joins/leaves are ignored.
 */
export function presenceIntervals(events, start, end) {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const sorted = [...events].sort((a, b) => new Date(a.at) - new Date(b.at));
  const out = [];
  let open = null;
  for (const ev of sorted) {
    const t = new Date(ev.at).getTime();
    if (ev.type === 'join' && open === null) open = t;
    else if (ev.type === 'leave' && open !== null) {
      out.push([open, t]);
      open = null;
    }
  }
  if (open !== null) out.push([open, Math.max(open, e)]);
  return mergeIntervals(out.map(([a, b]) => [Math.max(a, s), Math.min(b, e)]).filter(([a, b]) => b > a));
}

export function mergeIntervals(list) {
  const sorted = [...list].sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [a, b] of sorted) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

export const totalMinutes = (intervals) => intervals.reduce((sum, [a, b]) => sum + (b - a), 0) / 60000;

export function overlapMinutes(a, b) {
  let total = 0;
  for (const [a0, a1] of a) {
    for (const [b0, b1] of b) {
      const lo = Math.max(a0, b0);
      const hi = Math.min(a1, b1);
      if (hi > lo) total += hi - lo;
    }
  }
  return total / 60000;
}

/**
 * Applies the admin-configured completion policy.
 *  - trainer never joined            → trainer_no_show (learner keeps the day, nobody is paid)
 *  - learner never joined            → learner_no_show (no day consumed)
 *  - both joined, thresholds met     → completed (day consumed once, trainer earns once)
 *  - both joined, thresholds not met → needs_review (technical problem; an admin decides)
 */
export function decideOutcome({ trainerMin, learnerMin, overlapMin, durationMin, policy }) {
  const need = Math.ceil((durationMin * policy.minAttendancePct) / 100);
  const needOverlap = Math.ceil((durationMin * policy.minOverlapPct) / 100);
  if (trainerMin < 1) return { status: 'trainer_no_show', reason: 'The trainer did not join the session.' };
  if (learnerMin < 1) return { status: 'learner_no_show', reason: 'The learner did not join the session.' };
  if (trainerMin >= need && learnerMin >= need && overlapMin >= needOverlap) {
    return { status: 'completed', reason: 'Both participants attended long enough to meet the completion policy.' };
  }
  return {
    status: 'needs_review',
    reason: `Attendance below policy (trainer ${Math.round(trainerMin)}m, learner ${Math.round(learnerMin)}m, together ${Math.round(overlapMin)}m; need ${need}m each and ${needOverlap}m together).`,
  };
}
