import { Booking, Slot, Trainer } from '../../models/index.js';
import { ApiError } from '../../utils/http.js';
import { addMinutes, zonedToUtc } from '../../utils/time.js';
import { getConfig } from './configService.js';
import { ratingsFor } from './ratingService.js';

/**
 * Expands "these dates, 09:00 → 13:00, 60 min" into back-to-back slots
 * (e.g. four one-hour sessions). Times are wall-clock in the configured timezone.
 */
export function expandSlots({ dates, startTime, endTime, durationMin, gapMin = 0, tz }) {
  const out = [];
  for (const date of dates) {
    const windowStart = zonedToUtc(date, startTime, tz);
    const windowEnd = zonedToUtc(date, endTime, tz);
    if (windowEnd <= windowStart) throw ApiError.badRequest(`End time must be after start time (${date}).`);
    for (let s = windowStart; addMinutes(s, durationMin) <= windowEnd; s = addMinutes(s, durationMin + gapMin)) {
      out.push({ start: s, end: addMinutes(s, durationMin), durationMin });
    }
  }
  return out;
}

export async function publishSlots(trainerId, input) {
  const cfg = await getConfig();
  const now = new Date();
  const earliest = addMinutes(now, cfg.booking.minLeadMinutes);
  const latest = addMinutes(now, cfg.booking.maxAdvanceDays * 1440);
  const candidates = expandSlots({ ...input, tz: cfg.timezone });
  if (!candidates.length) throw ApiError.badRequest('That time range is too short for even one session of this length.');
  if (candidates.length > 200) throw ApiError.badRequest('That would create too many slots at once (max 200).');

  const past = candidates.filter((c) => c.start < earliest);
  if (past.length) throw ApiError.badRequest(`Slots must start at least ${cfg.booking.minLeadMinutes} minutes from now.`);
  if (candidates.some((c) => c.start > latest)) throw ApiError.badRequest(`Slots can be published up to ${cfg.booking.maxAdvanceDays} days ahead.`);

  // Overlap check against everything this trainer already has live (and within the batch itself).
  const lo = candidates.reduce((m, c) => (c.start < m ? c.start : m), candidates[0].start);
  const hi = candidates.reduce((m, c) => (c.end > m ? c.end : m), candidates[0].end);
  const existing = await Slot.find({ trainer: trainerId, active: true, start: { $lt: hi }, end: { $gt: lo } }).select('start end');
  const clash = candidates.find((c) => existing.some((e) => e.start < c.end && e.end > c.start));
  if (clash) throw ApiError.conflict(`Slot ${clash.start.toISOString()} overlaps one you already published.`);
  const sorted = [...candidates].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].start < sorted[i - 1].end) throw ApiError.conflict('Your own new slots overlap each other.');
  }

  try {
    return await Slot.insertMany(candidates.map((c) => ({ ...c, trainer: trainerId })), { ordered: true });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('One of those slots already exists.');
    throw err;
  }
}

/** Trainers may only remove slots nobody has booked. Booked slots go through cancel/reschedule. */
export async function deleteSlot(trainerId, slotId) {
  const slot = await Slot.findOneAndDelete({ _id: slotId, trainer: trainerId, status: 'available', active: true });
  if (!slot) {
    const exists = await Slot.findOne({ _id: slotId, trainer: trainerId });
    if (!exists) throw ApiError.notFound('Slot not found');
    throw ApiError.conflict('This slot is booked. Booked slots cannot be deleted — cancel the booking with a reason so the learner can be rescheduled.');
  }
  return slot;
}

/** Published, still-open slots a learner may choose from. */
export async function browseSlots({ trainerId, from, to, limit = 300 }) {
  const cfg = await getConfig();
  const now = new Date();
  const earliest = addMinutes(now, cfg.booking.minLeadMinutes);
  const filter = { status: 'available', active: true, start: { $gte: from && from > earliest ? from : earliest } };
  if (to) filter.start.$lte = to;
  if (trainerId) filter.trainer = trainerId;
  return Slot.find(filter).sort({ start: 1 }).limit(limit).select('trainer start end durationMin');
}

/** Trainers learners can book: active accounts that currently have open slots. */
export async function trainersWithAvailability() {
  const cfg = await getConfig();
  const earliest = addMinutes(new Date(), cfg.booking.minLeadMinutes);
  const open = await Slot.aggregate([
    { $match: { status: 'available', active: true, start: { $gte: earliest } } },
    { $group: { _id: '$trainer', openSlots: { $sum: 1 }, nextSlot: { $min: '$start' } } },
  ]);
  const byUser = new Map(open.map((o) => [String(o._id), o]));
  const trainers = await Trainer.find({ isPublished: true }).populate('user', 'isActive');
  const ratings = await ratingsFor(trainers.map((t) => t.user?._id).filter(Boolean));
  return trainers
    .filter((t) => t.user?.isActive)
    .map((t) => {
      const o = t.toObject();
      const a = byUser.get(String(t.user._id));
      return {
        ...o,
        user: String(t.user._id),
        rating: ratings.get(String(t.user._id)) || { average: null, count: 0 },
        openSlots: a?.openSlots || 0,
        nextSlot: a?.nextSlot || null,
      };
    })
    .sort((a, b) => b.openSlots - a.openSlots);
}

export async function trainerHasUpcoming(trainerId) {
  return Booking.countDocuments({ trainer: trainerId, status: 'confirmed', startAt: { $gt: new Date() } });
}
