/**
 * End-to-end tests of the training platform against a REAL MongoDB — but a throw-away database
 * (default: aura_training_test), which is dropped at the start. Requires MongoDB running locally:
 *   npm run test:training
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

process.env.MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/aura_training_test';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.MEETING_PROVIDER = 'demo';
if (!/test/i.test(process.env.MONGO_URI)) throw new Error('Refusing to run: the test database name must contain "test"');

const { default: mongoose } = await import('mongoose');
const { env } = await import('../src/config/env.js');
const { connectDB } = await import('../src/config/db.js');
const { createApp } = await import('../src/app.js');
const M = await import('../src/models/index.js');
const { getConfig, updateConfig } = await import('../src/services/training/configService.js');
const { seedDefaultPackages } = await import('../src/seed/defaultPackages.js');
const { runTrainingJobs } = await import('../src/services/training/reminderService.js');
const { dayKeyOf } = await import('../src/utils/time.js');

const PASS = 'Passw0rd!x';
let server;
let base;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Client': 'mobile', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const login = async (email, password = PASS) => (await call('POST', '/auth/login', { body: { identifier: email, password } })).body.data.accessToken;

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq += 1)}`;
const istDay = (offset) => new Date(Date.now() + offset * 86400000 + 5.5 * 3600000).toISOString().slice(0, 10);

async function registerLearner(name = 'Test Learner') {
  const id = uniq();
  const r = await call('POST', '/auth/register', {
    body: { name, email: `learner-${id}@example.com`, phone: `+9198${String(Date.now()).slice(-6)}${String(seq).padStart(2, '0')}`, password: 'Learner123', confirmPassword: 'Learner123', acceptTerms: true, acceptPrivacy: true },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { token: r.body.data.accessToken, user: r.body.data.user, email: r.body.data.user.email };
}

async function buy(token, code, mode) {
  const pkgs = (await call('GET', '/packages')).body.data.packages;
  const pkg = pkgs.find((p) => p.code === code);
  const co = await call('POST', '/subscriptions/checkout', { token, body: { packageId: pkg._id, mode } });
  if (co.status !== 201) return { co };
  const v = await call('POST', '/payments/verify', { token, body: { orderId: co.body.data.orderId, payload: { mockToken: co.body.data.mockToken } } });
  return { co, v, pkg };
}

const mySubs = async (token) => (await call('GET', '/subscriptions/me', { token })).body.data;

let admin; let adminTok; let trainer; let trainerTok; let trainer2; let trainer2Tok; let slots;

/** Moves a booking into the past (the API refuses to book the past) and records provider attendance. */
async function runSession(bookingId, { trainerMin, learnerMin, minutesAgo = 180, dayKey } = {}) {
  const b = await M.Booking.findById(bookingId);
  const startAt = new Date(Date.now() - minutesAgo * 60000);
  const endAt = new Date(startAt.getTime() + 60 * 60000);
  await M.Booking.updateOne({ _id: b._id }, { startAt, endAt, dayKey: dayKey || dayKeyOf(startAt, 'Asia/Kolkata') });
  const ev = (user, role, [from, to]) => [
    { booking: b._id, user, role, type: 'join', at: new Date(startAt.getTime() + from * 60000), source: 'provider' },
    { booking: b._id, user, role, type: 'leave', at: new Date(startAt.getTime() + to * 60000), source: 'provider' },
  ];
  const events = [];
  if (trainerMin) events.push(...ev(b.trainer, 'trainer', [0, trainerMin]));
  if (learnerMin) events.push(...ev(b.learner, 'learner', [0, learnerMin]));
  if (events.length) await M.AttendanceEvent.insertMany(events);
}

const bookingStatus = async (id) => (await M.Booking.findById(id)).status;

before(async () => {
  await connectDB();
  assert.match(mongoose.connection.name, /test/i);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  await getConfig({ fresh: true });
  await seedDefaultPackages();
  admin = await M.User.create({ name: 'Admin', email: 'admin-test@example.com', password: PASS, role: 'admin', emailVerified: true });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  adminTok = await login('admin-test@example.com');
  assert.ok(adminTok);
});

after(async () => {
  server?.close();
  await mongoose.disconnect();
});

describe('roles, trainer accounts and pricing', () => {
  test('trainer self-registration is refused; only an admin can create trainers', async () => {
    const attempt = await call('POST', '/trainer-applications', { body: { name: 'Sneaky', email: 'sneaky@example.com' } });
    assert.equal(attempt.status, 403);
    const l = await registerLearner();
    const asLearner = await call('POST', '/admin/trainers', { token: l.token, body: { name: 'Nope Trainer', email: 'nope@example.com', phone: '+919800000001' } });
    assert.equal(asLearner.status, 403);
    assert.equal((await call('POST', '/admin/trainers', { body: {} })).status, 401);

    const r = await call('POST', '/admin/trainers', { token: adminTok, body: { name: 'Tara Trainer', email: 'tara-test@example.com', phone: '+919800000002', title: 'Guide' } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.ok(r.body.data.temporaryPassword, 'a temporary password is returned once when the admin does not set one');
    trainer = await M.User.findOne({ email: 'tara-test@example.com' });
    trainerTok = await login('tara-test@example.com', r.body.data.temporaryPassword);
    assert.ok(trainerTok, 'the admin-created trainer can log in immediately');
    const r2 = await call('POST', '/admin/trainers', { token: adminTok, body: { name: 'Uma Trainer', email: 'uma-test@example.com', phone: '+919800000003', password: PASS, payoutPerSession: 650 } });
    assert.equal(r2.body.data.temporaryPassword, undefined);
    trainer2 = await M.User.findOne({ email: 'uma-test@example.com' });
    trainer2Tok = await login('uma-test@example.com');
  });

  test('plan prices derive from the admin base rate and discounts — and re-price when settings change', async () => {
    const { body } = await call('GET', '/packages');
    const by = Object.fromEntries(body.data.packages.map((p) => [p.code, p.price]));
    assert.equal(by.daily.amount, 1000);
    assert.equal(by.weekly.amount, 6300);
    assert.equal(by.weekly.savings, 700);
    assert.equal(by.monthly.amount, 24000);
    assert.equal((await call('PUT', '/training-config', { token: trainerTok, body: { dailyRate: 1 } })).status, 403);
    assert.equal((await call('PUT', '/training-config', { token: adminTok, body: { dailyRate: 1200 } })).status, 200);
    const again = (await call('GET', '/packages')).body.data.packages.find((p) => p.code === 'weekly');
    assert.equal(again.price.amount, 7560);
    await call('PUT', '/training-config', { token: adminTok, body: { dailyRate: 1000 } });
    assert.equal((await call('PUT', '/training-config', { token: adminTok, body: { dailyRate: -5 } })).status, 400);
  });
});

describe('slots', () => {
  test('a trainer publishes four one-hour slots per day; overlaps and past times are rejected', async () => {
    const dates = Array.from({ length: 14 }, (_, i) => istDay(i + 2));
    const r = await call('POST', '/slots', { token: trainerTok, body: { dates, startTime: '06:00', endTime: '10:00', durationMin: 60 } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.data.count, 14 * 4);
    const overlap = await call('POST', '/slots', { token: trainerTok, body: { dates: [dates[0]], startTime: '06:30', endTime: '07:30', durationMin: 60 } });
    assert.equal(overlap.status, 409);
    const past = await call('POST', '/slots', { token: trainerTok, body: { dates: [istDay(-1)], startTime: '06:00', endTime: '07:00', durationMin: 60 } });
    assert.equal(past.status, 400);
    assert.equal((await call('POST', '/slots', { token: (await registerLearner()).token, body: { dates, startTime: '11:00', endTime: '12:00', durationMin: 60 } })).status, 403);
    await call('POST', '/slots', { token: trainer2Tok, body: { dates: [dates[0]], startTime: '06:00', endTime: '08:00', durationMin: 60 } });
    const avail = await call('GET', `/slots/available?trainer=${trainer.id}`, { token: adminTok });
    slots = avail.body.data;
    assert.equal(slots.length, 56);
  });
});

describe('payment and package activation', () => {
  test('booking without a paid package is refused', async () => {
    const l = await registerLearner();
    const r = await call('POST', '/bookings', { token: l.token, body: { slotId: slots[0]._id } });
    assert.equal(r.status, 402);
  });

  test('a forged payment never grants a package; a verified one does exactly once', async () => {
    const l = await registerLearner();
    const { data } = (await call('GET', '/packages')).body;
    const weekly = data.packages.find((p) => p.code === 'weekly');
    const co = await call('POST', '/subscriptions/checkout', { token: l.token, body: { packageId: weekly._id } });
    assert.equal(co.status, 201);
    assert.equal(co.body.data.amount, 6300, 'server-computed amount');
    const forged = await call('POST', '/payments/verify', { token: l.token, body: { orderId: co.body.data.orderId, payload: { mockToken: 'forged' } } });
    assert.equal(forged.status, 400);
    assert.equal((await mySubs(l.token)).subscriptions.length, 0);
    // The client claiming "success" in the payload means nothing either.
    const claim = await call('POST', '/payments/verify', { token: l.token, body: { orderId: co.body.data.orderId, payload: { success: true, status: 'paid' } } });
    assert.equal(claim.status, 400);
    assert.equal((await mySubs(l.token)).subscriptions.length, 0);

    const co2 = await call('POST', '/subscriptions/checkout', { token: l.token, body: { packageId: weekly._id } });
    const good = { orderId: co2.body.data.orderId, payload: { mockToken: co2.body.data.mockToken } };
    const results = await Promise.all([1, 2, 3].map(() => call('POST', '/payments/verify', { token: l.token, body: good })));
    assert.ok(results.every((x) => x.status === 200));
    const s = await mySubs(l.token);
    assert.equal(s.subscriptions.length, 1, 'parallel verifications create one subscription');
    assert.equal(s.current.trainingDays, 7);
    assert.equal(s.remainingDays, 7);
    assert.equal(await M.Payment.countDocuments({ user: l.user._id, status: 'paid' }), 1);
  });

  test('renew / upgrade policy: no stacking duplicate plans while days remain', async () => {
    const l = await registerLearner();
    assert.equal((await buy(l.token, 'weekly')).v.status, 200);
    const dup = await buy(l.token, 'weekly');
    assert.equal(dup.co.status, 409);
    const up = await buy(l.token, 'monthly', 'upgrade');
    assert.equal(up.co.body.data.mode, 'upgrade');
    assert.equal(up.v.status, 200);
    const noDownGrade = await buy(l.token, 'daily', 'upgrade');
    assert.equal(noDownGrade.co.status, 400);
  });
});

describe('booking, double-booking and access control', () => {
  let learnerA; let learnerB; let bookingA;
  before(async () => {
    learnerA = await registerLearner('Learner A');
    learnerB = await registerLearner('Learner B');
    await buy(learnerA.token, 'monthly');
    await buy(learnerB.token, 'monthly');
  });

  test('two learners racing for one slot: exactly one wins', async () => {
    const target = slots[40]._id;
    const [a, b] = await Promise.all([
      call('POST', '/bookings', { token: learnerA.token, body: { slotId: target } }),
      call('POST', '/bookings', { token: learnerB.token, body: { slotId: target } }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
    assert.equal(await M.Booking.countDocuments({ slot: target, status: 'confirmed' }), 1);
    const winner = a.status === 201 ? a : b;
    assert.equal(winner.body.data.status, 'confirmed', 'confirmed automatically — no trainer acceptance step');
    assert.ok(winner.body.data.meeting.joinUrl.includes('/session/'));
    assert.equal(winner.body.data.meeting.isDemo, true, 'demo meeting is labelled');
  });

  test('the same learner cannot hammer one slot or hold more bookings than days; slots must be published', async () => {
    const l = await registerLearner();
    // an admin-defined plan with exactly one training day but a month of validity
    const mk = await call('POST', '/packages', { token: adminTok, body: { code: `one-flex-${uniq()}`, name: 'One flexible day', trainingDays: 1, validityDays: 30, discountType: 'amount', discountValue: 0 } });
    assert.equal(mk.status, 201, JSON.stringify(mk.body));
    assert.equal(mk.body.data.price.amount, 1000);
    assert.equal((await call('POST', '/packages', { token: trainerTok, body: {} })).status, 403);
    const co = await call('POST', '/subscriptions/checkout', { token: l.token, body: { packageId: mk.body.data._id } });
    await call('POST', '/payments/verify', { token: l.token, body: { orderId: co.body.data.orderId, payload: { mockToken: co.body.data.mockToken } } });
    const first = await call('POST', '/bookings', { token: l.token, body: { slotId: slots[10]._id } });
    assert.equal(first.status, 201);
    const second = await call('POST', '/bookings', { token: l.token, body: { slotId: slots[20]._id } });
    assert.equal(second.status, 402, 'the only training day is already reserved');
    assert.equal((await mySubs(l.token)).availableToBook, 0);
    const slot20 = await M.Slot.findById(slots[20]._id);
    assert.equal(slot20.status, 'available', 'a refused booking must not hold the slot');
    const unpublished = await call('POST', '/bookings', { token: l.token, body: { slotId: '64b000000000000000000000' } });
    assert.equal(unpublished.status, 409);
  });

  test('one session per day by default', async () => {
    bookingA = null;
    const day1 = slots.filter((s) => dayKeyOf(new Date(s.start), 'Asia/Kolkata') === dayKeyOf(new Date(slots[0].start), 'Asia/Kolkata'));
    const ok1 = await call('POST', '/bookings', { token: learnerA.token, body: { slotId: day1[0]._id } });
    assert.equal(ok1.status, 201, JSON.stringify(ok1.body));
    bookingA = ok1.body.data;
    const same = await call('POST', '/bookings', { token: learnerA.token, body: { slotId: day1[1]._id } });
    assert.equal(same.status, 409);
  });

  test('privacy: others cannot read a booking; learners never receive the host link', async () => {
    assert.equal((await call('GET', `/bookings/${bookingA._id}`, { token: learnerB.token })).status, 404);
    assert.equal((await call('GET', `/bookings/${bookingA._id}`, { token: trainer2Tok })).status, 404);
    const asLearner = (await call('GET', `/bookings/${bookingA._id}`, { token: learnerA.token })).body.data;
    assert.equal(asLearner.meeting.hostUrl, undefined);
    assert.ok(asLearner.meeting.joinUrl);
    assert.equal((await call('GET', `/bookings/${bookingA._id}`, { token: trainerTok })).status, 200);
    const mine = (await call('GET', '/bookings/me', { token: learnerB.token })).body.data;
    assert.ok(mine.every((b) => String(b.learner._id) === String(learnerB.user._id)));
    assert.equal((await call('GET', '/admin/bookings', { token: learnerA.token })).status, 403);
    assert.equal((await call('GET', '/admin/payouts', { token: trainerTok })).status, 403);
  });

  test('a trainer cannot delete a booked slot; trainers cannot touch other trainers\' slots', async () => {
    const del = await call('DELETE', `/slots/${bookingA.slot}`, { token: trainerTok });
    assert.equal(del.status, 409);
    const other = await call('DELETE', `/slots/${slots[50]._id}`, { token: trainer2Tok });
    assert.equal(other.status, 404);
    const freeOwn = await call('DELETE', `/slots/${slots[55]._id}`, { token: trainerTok });
    assert.equal(freeOwn.status, 200);
  });

  test('demo attendance is refused outside the join window and for non-participants', async () => {
    const early = await call('POST', `/bookings/${bookingA._id}/attendance`, { token: learnerA.token, body: { type: 'join' } });
    assert.equal(early.status, 400);
    const stranger = await call('POST', `/bookings/${bookingA._id}/attendance`, { token: learnerB.token, body: { type: 'join' } });
    assert.equal(stranger.status, 403);
  });

  test('cancellation cutoff, slot reopening, and rescheduling', async () => {
    const l = await registerLearner();
    await buy(l.token, 'monthly');
    const far = slots[30];
    const b = (await call('POST', '/bookings', { token: l.token, body: { slotId: far._id } })).body.data;
    const moved = await call('POST', `/bookings/${b._id}/reschedule`, { token: l.token, body: { slotId: slots[32]._id } });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal((await M.Slot.findById(far._id)).status, 'available', 'old slot reopened');
    assert.equal((await M.Slot.findById(slots[32]._id)).status, 'booked');
    assert.equal((await M.Subscription.findOne({ user: l.user._id })).reservedDays, 1, 'still one reserved day');

    // inside the cutoff the learner may not cancel or move
    await M.Booking.updateOne({ _id: b._id }, { startAt: new Date(Date.now() + 60 * 60000), endAt: new Date(Date.now() + 120 * 60000) });
    assert.equal((await call('POST', `/bookings/${b._id}/cancel`, { token: l.token, body: {} })).status, 403);
    await M.Booking.updateOne({ _id: b._id }, { startAt: new Date(Date.now() + 48 * 3600000), endAt: new Date(Date.now() + 49 * 3600000) });
    const c = await call('POST', `/bookings/${b._id}/cancel`, { token: l.token, body: {} });
    assert.equal(c.status, 200);
    assert.equal((await M.Subscription.findOne({ user: l.user._id })).reservedDays, 0, 'cancelling releases the held day');
    assert.equal((await call('POST', `/bookings/${b._id}/cancel`, { token: l.token, body: {} })).status, 409, 'cannot cancel twice');
    assert.equal((await mySubs(l.token)).subscriptions[0].daysUsed, 0, 'a cancellation never consumes a training day');
  });

  test('trainer cancellation needs a reason, withdraws the slot and notifies the learner', async () => {
    const l = await registerLearner();
    await buy(l.token, 'monthly');
    const b = (await call('POST', '/bookings', { token: l.token, body: { slotId: slots[34]._id } })).body.data;
    assert.equal((await call('POST', `/bookings/${b._id}/cancel`, { token: trainerTok, body: {} })).status, 400);
    assert.equal((await call('POST', `/bookings/${b._id}/cancel`, { token: trainerTok, body: { reason: 'Unwell' } })).status, 200);
    assert.equal((await M.Slot.findById(slots[34]._id)).status, 'cancelled');
    const n = await M.Notification.find({ user: l.user._id, 'related.id': b._id });
    assert.ok(n.some((x) => /cancelled/i.test(x.title)));
    assert.equal((await mySubs(l.token)).subscriptions[0].reservedDays, 0);
  });
});

describe('training-day counting and trainer earnings', () => {
  test('Mon + Thu completed, Tue/Wed idle → exactly 2 training days used, 2 earnings, idempotent', async () => {
    const l = await registerLearner('Flexible Fiona');
    await buy(l.token, 'monthly');
    const monday = (await call('POST', '/bookings', { token: l.token, body: { slotId: slots[4]._id } })).body.data;
    const thursday = (await call('POST', '/bookings', { token: l.token, body: { slotId: slots[16]._id } })).body.data;
    assert.ok(monday && thursday);
    assert.equal((await mySubs(l.token)).availableToBook, 28, 'two days held');
    await runSession(monday._id, { trainerMin: 58, learnerMin: 57, minutesAgo: 24 * 60 * 4 });
    await runSession(thursday._id, { trainerMin: 60, learnerMin: 60, minutesAgo: 24 * 60 * 1 });

    await runTrainingJobs();
    await runTrainingJobs(); // a second tick must change nothing
    await call('POST', `/admin/bookings/${monday._id}/reevaluate`, { token: adminTok });

    const sub = await M.Subscription.findOne({ user: l.user._id });
    assert.equal(sub.daysUsed, 2, 'two sessions → two training days, not four calendar days');
    assert.equal(sub.sessionsCompleted, 2);
    assert.equal(sub.reservedDays, 0);
    assert.equal(sub.trainingDays - sub.daysUsed, 28);
    assert.equal(await M.UsageRecord.countDocuments({ subscription: sub._id }), 2);
    const earnings = await M.Earning.find({ booking: { $in: [monday._id, thursday._id] } });
    assert.equal(earnings.length, 2);
    assert.ok(earnings.every((e) => e.amount === 500 && e.status === 'pending'));
    // no duplicated notifications
    const done = await M.Notification.countDocuments({ user: l.user._id, title: 'Session completed' });
    assert.equal(done, 2);
    const view = (await mySubs(l.token)).current;
    assert.equal(view.remainingDays, 28);
    assert.ok(new Date(view.expiresAt) > new Date(), 'calendar expiry is independent of days used');
  });

  test('trainer no-show: the learner keeps the day and nobody is paid', async () => {
    const l = await registerLearner();
    await buy(l.token, 'monthly');
    const b = (await call('POST', '/bookings', { token: l.token, body: { slotId: slots[8]._id } })).body.data;
    await runSession(b._id, { trainerMin: 0, learnerMin: 60 });
    await runTrainingJobs();
    assert.equal(await bookingStatus(b._id), 'trainer_no_show');
    const sub = await M.Subscription.findOne({ user: l.user._id });
    assert.deepEqual([sub.daysUsed, sub.reservedDays], [0, 0]);
    assert.equal(await M.Earning.countDocuments({ booking: b._id }), 0);
    assert.ok(await M.Notification.exists({ user: l.user._id, title: 'Trainer did not join' }));
    assert.ok(await M.Notification.exists({ user: admin._id, title: 'Trainer no-show' }));
  });

  test('learner no-show: no day used, no earning (default policy)', async () => {
    const l = await registerLearner();
    await buy(l.token, 'monthly');
    const b = (await call('POST', '/bookings', { token: l.token, body: { slotId: slots[12]._id } })).body.data;
    await runSession(b._id, { trainerMin: 60, learnerMin: 0 });
    await runTrainingJobs();
    assert.equal(await bookingStatus(b._id), 'learner_no_show');
    assert.equal((await M.Subscription.findOne({ user: l.user._id })).daysUsed, 0);
    assert.equal(await M.Earning.countDocuments({ booking: b._id }), 0);
  });

  test('demo attendance never counts when the admin disables it; verified provider events always do', async () => {
    const l = await registerLearner();
    await buy(l.token, 'monthly');
    const b = (await call('POST', '/bookings', { token: l.token, body: { slotId: slots[18]._id } })).body.data;
    await updateConfig({ policy: { acceptDemoAttendance: false } });
    await runSession(b._id, {});
    const bk = await M.Booking.findById(b._id);
    await M.AttendanceEvent.insertMany([
      { booking: bk._id, user: bk.trainer, role: 'trainer', type: 'join', at: bk.startAt, source: 'demo' },
      { booking: bk._id, user: bk.learner, role: 'learner', type: 'join', at: bk.startAt, source: 'demo' },
    ]);
    await runTrainingJobs();
    assert.equal(await bookingStatus(b._id), 'trainer_no_show', 'demo events are ignored → no verified attendance');
    assert.equal(await M.Earning.countDocuments({ booking: b._id }), 0);
    await updateConfig({ policy: { acceptDemoAttendance: true } });
  });

  test('needs-review sessions hold the day until an admin resolves them — once', async () => {
    const l = await registerLearner();
    await buy(l.token, 'monthly');
    const b = (await call('POST', '/bookings', { token: l.token, body: { slotId: slots[22]._id } })).body.data;
    await runSession(b._id, { trainerMin: 10, learnerMin: 50 });
    await runTrainingJobs();
    assert.equal(await bookingStatus(b._id), 'needs_review');
    let sub = await M.Subscription.findOne({ user: l.user._id });
    assert.deepEqual([sub.daysUsed, sub.reservedDays], [0, 1]);
    assert.equal(await M.Earning.countDocuments({ booking: b._id }), 0);

    assert.equal((await call('POST', `/admin/bookings/${b._id}/resolve`, { token: trainerTok, body: { action: 'complete' } })).status, 403);
    const r = await call('POST', `/admin/bookings/${b._id}/resolve`, { token: adminTok, body: { action: 'complete', note: 'Verified by recording' } });
    assert.equal(r.status, 200);
    sub = await M.Subscription.findOne({ user: l.user._id });
    assert.deepEqual([sub.daysUsed, sub.reservedDays], [1, 0]);
    assert.equal(await M.Earning.countDocuments({ booking: b._id }), 1);
    assert.equal((await call('POST', `/admin/bookings/${b._id}/resolve`, { token: adminTok, body: { action: 'complete' } })).status, 409);

    const l2 = await registerLearner();
    await buy(l2.token, 'monthly');
    const b2 = (await call('POST', '/bookings', { token: l2.token, body: { slotId: slots[26]._id } })).body.data;
    await runSession(b2._id, { trainerMin: 5, learnerMin: 5 });
    await runTrainingJobs();
    await call('POST', `/admin/bookings/${b2._id}/resolve`, { token: adminTok, body: { action: 'technical_failure' } });
    assert.equal((await M.Subscription.findOne({ user: l2.user._id })).daysUsed, 0);
    assert.equal(await M.Earning.countDocuments({ booking: b2._id }), 0);
  });

  test('two completed sessions on the same calendar day use one training day but both trainers are paid', async () => {
    await updateConfig({ booking: { maxSessionsPerDay: 2 } });
    const l = await registerLearner();
    await buy(l.token, 'monthly');
    const dayKey = '2026-01-15';
    const a = (await call('POST', '/bookings', { token: l.token, body: { slotId: slots[36]._id } })).body.data;
    const b = (await call('POST', '/bookings', { token: l.token, body: { slotId: slots[37]._id } })).body.data;
    assert.ok(a && b);
    await runSession(a._id, { trainerMin: 60, learnerMin: 60, minutesAgo: 300, dayKey });
    await runSession(b._id, { trainerMin: 60, learnerMin: 60, minutesAgo: 200, dayKey });
    await runTrainingJobs();
    const sub = await M.Subscription.findOne({ user: l.user._id });
    assert.equal(sub.daysUsed, 1);
    assert.equal(sub.sessionsCompleted, 2);
    assert.equal(sub.reservedDays, 0);
    assert.equal(await M.Earning.countDocuments({ booking: { $in: [a._id, b._id] } }), 2);
    await updateConfig({ booking: { maxSessionsPerDay: 1 } });
  });

  test('per-trainer payout rate overrides the default; changing the global rate does not touch existing earnings', async () => {
    const l = await registerLearner();
    await buy(l.token, 'monthly');
    const t2slot = (await call('GET', `/slots/available?trainer=${trainer2.id}`, { token: l.token })).body.data[0];
    const b = (await call('POST', '/bookings', { token: l.token, body: { slotId: t2slot._id } })).body.data;
    await runSession(b._id, { trainerMin: 60, learnerMin: 60 });
    await runTrainingJobs();
    assert.equal((await M.Earning.findOne({ booking: b._id })).amount, 650);
    await call('PUT', '/training-config', { token: adminTok, body: { trainerPayoutPerSession: 999 } });
    assert.equal((await M.Earning.findOne({ booking: b._id })).amount, 650);
    await call('PUT', '/training-config', { token: adminTok, body: { trainerPayoutPerSession: 500 } });
  });
});

describe('payouts', () => {
  test('only an admin moves earnings pending → approved → paid; every step is guarded', async () => {
    const list = await call('GET', '/admin/payouts?status=pending', { token: adminTok });
    assert.equal(list.status, 200);
    const ids = list.body.data.filter((e) => String(e.trainer._id) === String(trainer._id)).map((e) => e._id);
    assert.ok(ids.length >= 2);

    assert.equal((await call('POST', '/admin/payouts/approve', { token: trainerTok, body: { ids } })).status, 403);
    assert.equal((await call('POST', '/admin/payouts/mark-paid', { token: adminTok, body: { ids } })).status, 409, 'cannot pay before approval');
    const appr = await call('POST', '/admin/payouts/approve', { token: adminTok, body: { ids } });
    assert.equal(appr.body.data.updated, ids.length);
    assert.equal((await call('POST', '/admin/payouts/approve', { token: adminTok, body: { ids } })).status, 409, 'no double approval');

    const [paidId, ...rest] = ids;
    const paid = await call('POST', '/admin/payouts/mark-paid', { token: adminTok, body: { ids: [paidId], reference: 'UTR123' } });
    assert.equal(paid.body.data.updated, 1);
    assert.equal((await call('POST', '/admin/payouts/mark-paid', { token: adminTok, body: { ids: [paidId] } })).status, 409, 'no double payment');
    const failed = await call('POST', '/admin/payouts/mark-failed', { token: adminTok, body: { ids: rest.slice(0, 1), reason: 'Bank rejected' } });
    assert.equal(failed.status, 200);

    const mine = await call('GET', '/trainer/earnings', { token: trainerTok });
    assert.equal(mine.status, 200);
    assert.equal(mine.body.meta.totals.paid.count, 1);
    assert.equal((await M.Earning.findById(paidId)).payoutReference, 'UTR123');
    // trainers see only their own lines
    const theirs = await call('GET', '/trainer/earnings', { token: trainer2Tok });
    assert.ok(theirs.body.data.every((e) => String(e._id) !== String(paidId)));
    assert.equal((await call('PATCH', `/admin/payouts/${paidId}`, { token: trainerTok, body: { amount: 99999 } })).status, 403, 'trainers cannot edit payout amounts or statuses');
  });

  test('the admin report links booking, attendance, usage and earning', async () => {
    const r = await call('GET', '/admin/reports/sessions?status=completed', { token: adminTok });
    assert.equal(r.status, 200);
    const row = r.body.data[0];
    assert.ok(row.events.length >= 2);
    assert.equal(row.usage.counted !== undefined, true);
    assert.ok(row.earning.amount > 0);
  });
});

describe('expiry, reminders and trainer account control', () => {
  test('expired packages block booking; expiry and reminders are notified exactly once', async () => {
    const l = await registerLearner();
    await buy(l.token, 'weekly');
    await M.Subscription.updateOne({ user: l.user._id }, { expiresAt: new Date(Date.now() + 2 * 86400000) });
    await runTrainingJobs();
    await runTrainingJobs();
    const reminders = await M.Notification.countDocuments({ user: l.user._id, type: 'package', title: /expires in/ });
    assert.equal(reminders, 1, 'one reminder per threshold, no duplicates');

    await M.Subscription.updateOne({ user: l.user._id }, { expiresAt: new Date(Date.now() - 1000) });
    const refused = await call('POST', '/bookings', { token: l.token, body: { slotId: slots[2]._id } });
    assert.equal(refused.status, 402);
    await runTrainingJobs();
    await runTrainingJobs();
    assert.equal(await M.Notification.countDocuments({ user: l.user._id, title: 'Your package has expired' }), 1);
    assert.equal((await M.Subscription.findOne({ user: l.user._id })).status, 'expired');
    // renewal is allowed once the old package is gone
    const again = await buy(l.token, 'weekly');
    assert.equal(again.v.status, 200);
  });

  test('deactivating a trainer withdraws open slots and blocks login', async () => {
    const r = await call('POST', '/admin/trainers', { token: adminTok, body: { name: 'Temp Trainer', email: 'temp-test@example.com', phone: '+919800000009', password: PASS } });
    const id = r.body.data.id;
    const tTok = await login('temp-test@example.com');
    await call('POST', '/slots', { token: tTok, body: { dates: [istDay(5)], startTime: '14:00', endTime: '16:00', durationMin: 60 } });
    assert.equal(await M.Slot.countDocuments({ trainer: id, status: 'available' }), 2);
    const off = await call('PATCH', `/admin/trainers/${id}`, { token: adminTok, body: { isActive: false } });
    assert.equal(off.status, 200);
    assert.equal(await M.Slot.countDocuments({ trainer: id, status: 'available', active: true }), 0);
    const attempt = await call('POST', '/auth/login', { body: { identifier: 'temp-test@example.com', password: PASS } });
    assert.equal(attempt.status, 403);
    const browse = (await call('GET', '/slots/trainers', { token: adminTok })).body.data;
    assert.ok(!browse.some((t) => t.user === id));
  });

  test('registration creates notifications; payments create notifications', async () => {
    const l = await registerLearner();
    assert.ok(await M.Notification.exists({ user: l.user._id, type: 'registration' }));
    await buy(l.token, 'daily');
    assert.ok(await M.Notification.exists({ user: l.user._id, type: 'payment_success' }));
    assert.ok(await M.Notification.exists({ user: l.user._id, type: 'package' }));
  });
});

describe('feedback', () => {
  test('only the learner of a completed session can rate it, once; ratings appear on the trainer page', async () => {
    const l = await registerLearner();
    const other = await registerLearner();
    await buy(l.token, 'monthly');
    const b = (await call('POST', '/bookings', { token: l.token, body: { slotId: slots[44]._id } })).body.data;
    const early = await call('POST', '/feedback', { token: l.token, body: { bookingId: b._id, rating: 5 } });
    assert.equal(early.status, 400, 'not completed yet');
    await runSession(b._id, { trainerMin: 60, learnerMin: 60 });
    await runTrainingJobs();
    assert.equal((await call('POST', '/feedback', { token: other.token, body: { bookingId: b._id, rating: 5 } })).status, 404);
    assert.equal((await call('POST', '/feedback', { token: l.token, body: { bookingId: b._id, rating: 9 } })).status, 400);
    const ok1 = await call('POST', '/feedback', { token: l.token, body: { bookingId: b._id, rating: 4, comment: 'Very calming' } });
    assert.equal(ok1.status, 201, JSON.stringify(ok1.body));
    assert.equal((await call('POST', '/feedback', { token: l.token, body: { bookingId: b._id, rating: 5 } })).status, 409);
    const pub = (await call('GET', `/feedback/trainer/${trainer.id}`)).body.data;
    assert.ok(pub.count >= 1 && pub.items.some((i) => i.comment === 'Very calming'));
    assert.ok(!JSON.stringify(pub).includes(l.email), 'no learner contact details are public');
    const mine = (await call('GET', `/feedback/trainer/${trainer.id}/mine`, { token: l.token })).body.data;
    assert.ok(mine.some((x) => x.feedback?.rating === 4));
    const asAdmin = await call('GET', `/admin/feedback?trainer=${trainer.id}`, { token: adminTok });
    assert.equal(asAdmin.status, 200);
    assert.ok(asAdmin.body.data.some((f) => f.comment === 'Very calming' && f.learner.email === l.email));
    assert.equal(asAdmin.body.meta.average, 4);
    assert.equal((await call('GET', '/admin/feedback', { token: l.token })).status, 403);
    const list = (await call('GET', '/bookings/me?when=past', { token: l.token })).body.data;
    assert.equal(list.find((x) => x._id === b._id).feedback.rating, 4);
    assert.equal((await call('GET', `/feedback/trainer/${trainer.id}/mine`, { token: trainerTok })).status, 403);
  });
});

test('environment sanity: demo meeting provider is active and labelled', async () => {
  const cfg = await call('GET', '/training-config', { token: adminTok });
  assert.equal(cfg.body.data.meetings.isDemo, true);
  assert.equal(env.meetings.requested, 'demo');
});
