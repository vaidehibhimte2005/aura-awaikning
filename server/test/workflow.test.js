// Integration test for the registration → approval → marketplace → purchase journey.
// Needs a reachable MongoDB; it uses a throw-away database and is skipped otherwise:
//   npm run test:workflow
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const BASE_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/aura_awakening';
const TEST_URI = BASE_URI.replace(/\/[^/?]+(\?|$)/, '/aura_awakening_workflow_test$1');
process.env.MONGO_URI = TEST_URI;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-123456';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-test-refresh-test-refresh-1234';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.NODE_ENV = 'test';
process.env.SMTP_HOST = '';
delete process.env.REQUIRE_EMAIL_VERIFICATION;

let reachable = true;
try {
  await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 2500 });
} catch {
  reachable = false;
}

const skip = reachable ? false : 'MongoDB is not reachable';
let server;
let base;
let M; // models
let seedDemoCourses;

async function call(method, path, body, token) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

const learnerForm = (over = {}) => ({
  name: 'Lena Learner', email: 'lena@example.com', phone: '+91 98765 43210', password: 'Passw0rdTest', confirmPassword: 'Passw0rdTest',
  country: 'India', state: 'Maharashtra', city: 'Pune', interests: ['Meditation'], acceptTerms: true, acceptPrivacy: true, ...over,
});
const trainerForm = (over = {}) => ({
  name: 'Tara Trainer', email: 'tara@example.com', phone: '+919811122233', password: 'Passw0rdTest', confirmPassword: 'Passw0rdTest',
  country: 'India', state: 'Karnataka', city: 'Bengaluru', displayName: 'Tara Sharma', title: 'Mindfulness Teacher',
  shortBio: 'Ten years guiding people through mindful living and meditation.', specialties: ['Mindfulness'], experienceYears: 10,
  languages: ['English', 'Hindi'], qualifications: 'RYT 500, MBSR certified', teachingCategories: ['Meditation'], topics: ['Breathwork'],
  teachingFormat: 'online', sessionType: 'both', methodology: 'Gentle, practice-first teaching.', targetAudience: 'Busy professionals',
  acceptTerms: true, acceptTrainerAgreement: true, acceptPrivacy: true, ...over,
});

const ctx = {};

before(async () => {
  if (!reachable) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  const { connectDB } = await import('../src/config/db.js');
  const { createApp } = await import('../src/app.js');
  M = await import('../src/models/index.js');
  ({ seedDemoCourses } = await import('../src/seed/demoCourses.js'));
  await connectDB(TEST_URI);
  await Promise.all(Object.values(M).filter((m) => m.init).map((m) => m.init()));
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;

  await M.User.create({ name: 'Admin', email: 'admin@example.com', password: 'Passw0rdTest', role: 'admin' });
  await M.User.create({ name: 'Manny Manager', email: 'manager@example.com', password: 'Passw0rdTest', role: 'manager' });
  ctx.category = await M.Category.create({ name: 'Meditation', slug: 'meditation' });
});

after(async () => {
  server?.close();
  if (reachable) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test('learner registration validates, assigns the learner role and rejects duplicates', { skip }, async () => {
  let r = await call('POST', '/auth/register', learnerForm({ acceptTerms: false }));
  assert.equal(r.status, 400);

  r = await call('POST', '/auth/register', { ...learnerForm(), role: 'admin' }); // role must be ignored
  assert.equal(r.status, 201);
  assert.equal(r.data.user.role, 'learner');
  assert.equal(r.data.user.password, undefined);
  ctx.learnerId = r.data.user._id;

  assert.equal((await call('POST', '/auth/register', learnerForm({ phone: '+919000000001' }))).status, 409, 'duplicate email');
  assert.equal((await call('POST', '/auth/register', learnerForm({ email: 'other@example.com' }))).status, 409, 'duplicate phone');

  const stored = await M.User.findById(ctx.learnerId).select('+password');
  assert.notEqual(stored.password, 'Passw0rdTest');
  assert.match(stored.password, /^\$2[aby]\$/);
});

test('login works with email or mobile number and never reveals which part was wrong', { skip }, async () => {
  const byPhone = await call('POST', '/auth/login', { identifier: '+91 98765 43210', password: 'Passw0rdTest' });
  assert.equal(byPhone.status, 200);
  ctx.learnerToken = byPhone.data.accessToken;
  assert.equal((await call('POST', '/auth/login', { identifier: 'lena@example.com', password: 'Passw0rdTest' })).status, 200);

  const wrongPw = await call('POST', '/auth/login', { identifier: 'lena@example.com', password: 'nope-nope-1' });
  const noUser = await call('POST', '/auth/login', { identifier: 'ghost@example.com', password: 'nope-nope-1' });
  assert.equal(wrongPw.status, 401);
  assert.equal(noUser.status, 401);
  assert.equal(wrongPw.message, noUser.message);
});

test('trainer application is PENDING, notifies staff and grants no trainer access', { skip }, async () => {
  const r = await call('POST', '/trainer-applications', trainerForm());
  assert.equal(r.status, 201);
  assert.equal(r.data.application.status, 'PENDING');
  assert.match(r.data.application.applicationId, /^AA-TR-\d{8}-[0-9A-F]{6}$/);
  ctx.trainerToken = r.data.accessToken;
  ctx.trainerUserId = r.data.user._id;
  assert.equal(r.data.user.role, 'trainer');
  assert.deepEqual(r.data.permissions, []);

  const staff = await M.User.find({ role: { $in: ['manager', 'admin'] } });
  for (const u of staff) {
    assert.equal(await M.Notification.countDocuments({ user: u._id, type: 'trainer_application' }), 1, `${u.role} notified`);
  }
  assert.equal((await call('GET', '/courses?scope=manage', null, ctx.trainerToken)).status, 403);
  assert.equal((await call('POST', '/courses', { title: 'Sneaky course' }, ctx.trainerToken)).status, 403);
  assert.equal((await call('GET', '/dashboard/trainer', null, ctx.trainerToken)).status, 403);
  assert.equal((await call('GET', '/trainers/me/profile', null, ctx.trainerToken)).status, 403);
  assert.equal((await call('GET', '/trainer-applications/me', null, ctx.trainerToken)).status, 200);

  const pub = await call('GET', '/trainers');
  assert.equal(pub.data.length, 0, 'pending trainer must not be public');
  assert.equal((await call('POST', '/trainer-applications', trainerForm())).status, 409, 'duplicate application');
});

test('only a manager can review; admin audits, learners and applicants cannot', { skip }, async () => {
  const mgr = await call('POST', '/auth/login', { identifier: 'manager@example.com', password: 'Passw0rdTest' });
  const adm = await call('POST', '/auth/login', { identifier: 'admin@example.com', password: 'Passw0rdTest' });
  ctx.mgrToken = mgr.data.accessToken;
  ctx.adminToken = adm.data.accessToken;

  const list = await call('GET', '/trainer-applications?q=tara', null, ctx.mgrToken);
  assert.equal(list.status, 200);
  assert.equal(list.data.length, 1);
  ctx.appId = list.data[0]._id;

  assert.equal((await call('GET', '/trainer-applications', null, ctx.learnerToken)).status, 403);
  assert.equal((await call('POST', `/trainer-applications/${ctx.appId}/review`, { decision: 'approve' }, ctx.trainerToken)).status, 403, 'applicant self-approval');
  assert.equal((await call('POST', `/trainer-applications/${ctx.appId}/review`, { decision: 'approve' }, ctx.learnerToken)).status, 403);
  assert.equal((await call('GET', '/trainer-applications', null, ctx.adminToken)).status, 200, 'admin can audit');
  assert.equal((await call('POST', `/trainer-applications/${ctx.appId}/review`, { decision: 'approve' }, ctx.adminToken)).status, 403, 'admin needs explicit permission to approve');

  assert.equal((await call('POST', `/trainer-applications/${ctx.appId}/review`, { decision: 'reject' }, ctx.mgrToken)).status, 400, 'reason mandatory');
  assert.equal((await call('POST', `/trainer-applications/${ctx.appId}/review`, { decision: 'start_review' }, ctx.mgrToken)).data.status, 'UNDER_REVIEW');

  const ok = await call('POST', `/trainer-applications/${ctx.appId}/review`, { decision: 'approve' }, ctx.mgrToken);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.status, 'APPROVED');
  assert.equal((await call('POST', `/trainer-applications/${ctx.appId}/review`, { decision: 'approve' }, ctx.mgrToken)).status, 409, 'no double decision');

  const app = await M.TrainerApplication.findById(ctx.appId);
  assert.ok(app.reviewedBy && app.reviewedAt);
  assert.equal(app.history.length, 3);
  assert.ok(await M.ActivityLog.exists({ action: 'trainer_application.approved' }));
  assert.equal(await M.Notification.countDocuments({ user: ctx.trainerUserId, type: 'trainer_application' }), 2); // under review + approved
});

test('approved trainer is public and can work; staff-only data stays hidden', { skip }, async () => {
  const login = await call('POST', '/auth/login', { identifier: 'tara@example.com', password: 'Passw0rdTest' });
  ctx.trainerToken = login.data.accessToken;
  assert.ok(login.data.permissions.includes('courses:manage_own'));
  const pub = await call('GET', '/trainers');
  assert.equal(pub.data.length, 1);
  assert.equal(JSON.stringify(pub).includes('tara@example.com'), false, 'no private email in public directory');
  assert.equal(JSON.stringify(pub).includes('+919811122233'), false);
  assert.equal((await call('GET', '/dashboard/trainer', null, ctx.trainerToken)).status, 200);

  const mine = await call('GET', '/trainer-applications/me', null, ctx.trainerToken);
  assert.equal(JSON.stringify(mine).includes('internalNotes'), false);
});

test('course approval workflow: trainers cannot bypass the manager', { skip }, async () => {
  const create = await call('POST', '/courses', {
    title: 'Calm Breath Basics', shortDescription: 'Learn calming breathwork.', description: 'x'.repeat(80),
    category: ctx.category.id, coverImage: 'https://example.com/c.jpg', outcomes: ['Breathe better'], price: 999, compareAtPrice: 1499,
    status: 'published', // must be ignored
  }, ctx.trainerToken);
  assert.equal(create.status, 201);
  assert.equal(create.data.status, 'draft');
  ctx.courseId = create.data._id;

  let r = await call('POST', `/courses/${ctx.courseId}/submit`, null, ctx.trainerToken);
  assert.equal(r.status, 400, 'needs at least one lesson');
  assert.ok(r.details?.problems?.length || r.message);

  const lesson = await call('POST', '/lessons', { course: ctx.courseId, title: 'First breath', youtubeUrl: 'https://youtu.be/inpok4MKVLM' }, ctx.trainerToken);
  assert.equal(lesson.status, 201);

  assert.equal((await call('PATCH', `/courses/${ctx.courseId}`, { status: 'published' }, ctx.trainerToken)).data.status, 'draft', 'status via PATCH is ignored');
  assert.equal((await call('POST', `/courses/${ctx.courseId}/publish`, null, ctx.trainerToken)).status, 409, 'cannot publish unapproved');

  r = await call('POST', `/courses/${ctx.courseId}/submit`, null, ctx.trainerToken);
  assert.equal(r.status, 200);
  assert.equal(r.data.status, 'pending_approval');
  assert.equal((await call('POST', `/courses/${ctx.courseId}/submit`, null, ctx.trainerToken)).status, 409);

  assert.equal((await call('POST', `/courses/${ctx.courseId}/review`, { decision: 'approve' }, ctx.trainerToken)).status, 403, 'self-approval');
  assert.equal((await call('POST', `/courses/${ctx.courseId}/review`, { decision: 'approve' }, ctx.adminToken)).status, 403);
  assert.equal((await call('POST', `/courses/${ctx.courseId}/review`, { decision: 'reject' }, ctx.mgrToken)).status, 400, 'reason mandatory');

  const pubBefore = await call('GET', '/courses');
  assert.equal(pubBefore.data.some((c) => c._id === ctx.courseId), false, 'unapproved never public');

  r = await call('POST', `/courses/${ctx.courseId}/review`, { decision: 'request_changes', reason: 'Add a preview lesson' }, ctx.mgrToken);
  assert.equal(r.data.status, 'needs_revision');
  assert.equal(r.data.reviewNote, 'Add a preview lesson');
  assert.equal((await call('POST', `/courses/${ctx.courseId}/submit`, null, ctx.trainerToken)).data.status, 'pending_approval');

  r = await call('POST', `/courses/${ctx.courseId}/review`, { decision: 'approve' }, ctx.mgrToken);
  assert.equal(r.data.status, 'approved');
  assert.ok(r.data.approvedBy && r.data.approvedAt);

  r = await call('POST', `/courses/${ctx.courseId}/publish`, null, ctx.trainerToken);
  assert.equal(r.data.status, 'published');
  const pub = await call('GET', '/courses');
  assert.equal(pub.data.some((c) => c._id === ctx.courseId), true);

  const hist = await call('GET', `/courses/${ctx.courseId}/history`, null, ctx.adminToken);
  assert.equal(hist.status, 200);
  assert.ok(hist.data.statusHistory.length >= 5);
  assert.equal(await M.Notification.countDocuments({ type: 'course_review', title: 'Course submitted for approval' }), 4, 'manager+admin × 2 submissions');
});

test('editing a published course pulls it back for re-approval', { skip }, async () => {
  const r = await call('PATCH', `/courses/${ctx.courseId}`, { price: 1299 }, ctx.trainerToken);
  assert.equal(r.status, 200);
  assert.equal(r.data.status, 'draft');
  assert.equal(r.data.pulledBack, true);
  assert.equal((await call('GET', '/courses')).data.some((c) => c._id === ctx.courseId), false);

  // back through review
  await call('POST', `/courses/${ctx.courseId}/submit`, null, ctx.trainerToken);
  await call('POST', `/courses/${ctx.courseId}/review`, { decision: 'approve' }, ctx.mgrToken);
  assert.equal((await call('POST', `/courses/${ctx.courseId}/publish`, null, ctx.trainerToken)).data.status, 'published');
});

test('purchase uses the server price, enrols once and notifies learner, trainer and admin', { skip }, async () => {
  const co = await call('POST', '/payments/checkout', { courseId: ctx.courseId, amount: 1 }, ctx.learnerToken);
  assert.equal(co.status, 201);
  assert.equal(co.data.amount, 1299, 'price comes from the database');

  const bad = await call('POST', '/payments/verify', { orderId: co.data.orderId, payload: { mockToken: 'forged' } }, ctx.learnerToken);
  assert.equal(bad.status, 400);
  assert.equal(await M.Enrollment.countDocuments({ course: ctx.courseId }), 0, 'forged verification must not enrol');

  const co2 = await call('POST', '/payments/checkout', { courseId: ctx.courseId }, ctx.learnerToken);
  const good = await call('POST', '/payments/verify', { orderId: co2.data.orderId, payload: { mockToken: co2.data.mockToken } }, ctx.learnerToken);
  assert.equal(good.data.status, 'paid');
  const again = await call('POST', '/payments/verify', { orderId: co2.data.orderId, payload: { mockToken: co2.data.mockToken } }, ctx.learnerToken);
  assert.equal(again.data.status, 'paid');

  assert.equal(await M.Enrollment.countDocuments({ course: ctx.courseId }), 1, 'no duplicate enrollment');
  assert.equal((await call('POST', '/payments/checkout', { courseId: ctx.courseId }, ctx.learnerToken)).status, 409, 'already enrolled');
  assert.equal(await M.Notification.countDocuments({ user: ctx.trainerUserId, title: 'New learner enrolled' }), 1);
  const admin = await M.User.findOne({ role: 'admin' });
  assert.equal(await M.Notification.countDocuments({ user: admin._id, type: 'payment_success' }), 1);
});

test("a user cannot read or mark another user's notifications", { skip }, async () => {
  const mine = await call('GET', '/notifications', null, ctx.learnerToken);
  assert.ok(mine.data.every((n) => String(n.user) === String(ctx.learnerId)));
  const theirs = await M.Notification.findOne({ user: ctx.trainerUserId });
  const r = await call('PATCH', `/notifications/${theirs.id}/read`, null, ctx.learnerToken);
  assert.equal(r.data.updated, 0);
  assert.equal((await M.Notification.findById(theirs.id)).readAt, undefined);
});

test('demo seed is idempotent', { skip }, async () => {
  const quiet = { log: () => {} };
  await seedDemoCourses(quiet);
  const first = await M.Course.countDocuments({ isDemo: true });
  const lessons = await M.Lesson.countDocuments();
  await seedDemoCourses(quiet);
  assert.equal(first, 6);
  assert.equal(await M.Course.countDocuments({ isDemo: true }), 6);
  assert.equal(await M.Lesson.countDocuments(), lessons);
});
