// Pure-logic tests for the completion policy, pricing and timezone maths — no database needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideOutcome, mergeIntervals, overlapMinutes, presenceIntervals, totalMinutes } from '../src/services/training/attendanceMath.js';
import { computePrice } from '../src/services/training/pricingService.js';
import { dayKeyOf, zonedToUtc } from '../src/utils/time.js';
import { expandSlots } from '../src/services/training/slotService.js';

const start = new Date('2026-03-02T10:00:00Z');
const end = new Date('2026-03-02T11:00:00Z');
const at = (min) => new Date(start.getTime() + min * 60000);
const policy = { minAttendancePct: 60, minOverlapPct: 50 };

test('presence: join/leave pairs are clipped to the session window', () => {
  const iv = presenceIntervals(
    [{ type: 'join', at: at(-5) }, { type: 'leave', at: at(30) }, { type: 'join', at: at(40) }, { type: 'leave', at: at(90) }],
    start, end,
  );
  assert.equal(totalMinutes(iv), 30 + 20);
});

test('presence: a join with no leave lasts until the session end; duplicates are ignored', () => {
  const iv = presenceIntervals([{ type: 'join', at: at(10) }, { type: 'join', at: at(20) }], start, end);
  assert.equal(totalMinutes(iv), 50);
  assert.equal(totalMinutes(presenceIntervals([{ type: 'leave', at: at(10) }], start, end)), 0);
});

test('overlap counts only time both were present', () => {
  const t = presenceIntervals([{ type: 'join', at: at(0) }, { type: 'leave', at: at(40) }], start, end);
  const l = presenceIntervals([{ type: 'join', at: at(20) }, { type: 'leave', at: at(60) }], start, end);
  assert.equal(overlapMinutes(t, l), 20);
  assert.deepEqual(mergeIntervals([[0, 5], [3, 9], [20, 30]]), [[0, 9], [20, 30]]);
});

test('policy: trainer never joined → no-show, even if the learner was there', () => {
  const r = decideOutcome({ trainerMin: 0, learnerMin: 60, overlapMin: 0, durationMin: 60, policy });
  assert.equal(r.status, 'trainer_no_show');
});

test('policy: learner never joined → learner no-show', () => {
  assert.equal(decideOutcome({ trainerMin: 55, learnerMin: 0, overlapMin: 0, durationMin: 60, policy }).status, 'learner_no_show');
});

test('policy: both attend long enough → completed; thresholds are inclusive', () => {
  assert.equal(decideOutcome({ trainerMin: 60, learnerMin: 58, overlapMin: 58, durationMin: 60, policy }).status, 'completed');
  assert.equal(decideOutcome({ trainerMin: 36, learnerMin: 36, overlapMin: 30, durationMin: 60, policy }).status, 'completed');
});

test('policy: both joined but too briefly → needs admin review, never silently counted', () => {
  assert.equal(decideOutcome({ trainerMin: 10, learnerMin: 50, overlapMin: 10, durationMin: 60, policy }).status, 'needs_review');
});

test('pricing: percent and fixed discounts are computed from the current daily rate', () => {
  const cfg = { dailyRate: 1000, currency: 'INR' };
  const weekly = computePrice({ trainingDays: 7, validityDays: 7, discountType: 'percent', discountValue: 10 }, cfg);
  assert.deepEqual([weekly.baseAmount, weekly.discount, weekly.amount, weekly.savings], [7000, 700, 6300, 700]);
  const monthly = computePrice({ trainingDays: 30, validityDays: 30, discountType: 'percent', discountValue: 20 }, cfg);
  assert.equal(monthly.amount, 24000);
  assert.equal(computePrice({ trainingDays: 1, validityDays: 1, discountType: 'percent', discountValue: 0 }, cfg).amount, 1000);
  const fixed = computePrice({ trainingDays: 7, validityDays: 7, discountType: 'amount', discountValue: 500 }, { dailyRate: 1200, currency: 'INR' });
  assert.deepEqual([fixed.baseAmount, fixed.amount], [8400, 7900]);
  // a discount can never push the price below zero
  assert.equal(computePrice({ trainingDays: 1, validityDays: 1, discountType: 'amount', discountValue: 99999 }, cfg).amount, 0);
});

test('time: calendar days are evaluated in the configured timezone', () => {
  // 23:30 UTC on 1 March is already 2 March in Kolkata (UTC+5:30)
  assert.equal(dayKeyOf(new Date('2026-03-01T23:30:00Z'), 'Asia/Kolkata'), '2026-03-02');
  assert.equal(dayKeyOf(new Date('2026-03-01T23:30:00Z'), 'UTC'), '2026-03-01');
  assert.equal(zonedToUtc('2026-03-02', '09:30', 'Asia/Kolkata').toISOString(), '2026-03-02T04:00:00.000Z');
});

test('slots: a 4-hour window becomes four back-to-back one-hour sessions', () => {
  const s = expandSlots({ dates: ['2026-03-02'], startTime: '09:00', endTime: '13:00', durationMin: 60, tz: 'Asia/Kolkata' });
  assert.equal(s.length, 4);
  assert.equal(s[0].start.toISOString(), '2026-03-02T03:30:00.000Z');
  assert.equal(s[3].end.toISOString(), '2026-03-02T07:30:00.000Z');
  assert.equal(expandSlots({ dates: ['2026-03-02'], startTime: '09:00', endTime: '09:50', durationMin: 60, tz: 'UTC' }).length, 0);
  assert.throws(() => expandSlots({ dates: ['2026-03-02'], startTime: '10:00', endTime: '09:00', durationMin: 60, tz: 'UTC' }));
});
