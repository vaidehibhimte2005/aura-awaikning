/**
 * End-to-end API smoke test. Run against a seeded development server:
 *   npm run seed:reset && npm run dev     (PAYMENT_PROVIDER=mock)
 *   npm run test:smoke                     (in another terminal)
 * Exercises auth, catalog, enrollment, progress, mock checkout + server-side
 * verification, and role-based access denials across frontend-facing APIs.
 */
const BASE = process.env.API_URL || 'http://localhost:5000/api';
const PASS = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe@123';
let passed = 0;
let failed = 0;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Client': 'mobile', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); } catch (e) { failed += 1; console.log(`  ✗ ${name}\n      ${e.message}`); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const login = async (email) => (await call('POST', '/auth/login', { body: { email, password: PASS } })).body.data;

console.log(`Smoke testing ${BASE}\n`);
const email = `smoke+${Date.now()}@example.com`;
let learner;
let course;
let paid;

await check('health', async () => expect((await call('GET', '/health')).status === 200, 'health failed'));
await check('register validates input', async () => {
  const r = await call('POST', '/auth/register', { body: { name: 'X', email: 'bad', password: '1', confirmPassword: '2' } });
  expect(r.status === 400 && r.body.success === false, `expected 400, got ${r.status}`);
});
await check('register', async () => {
  const r = await call('POST', '/auth/register', { body: { name: 'Smoke Tester', email, password: 'Smoke1234', confirmPassword: 'Smoke1234' } });
  expect(r.status === 201 && r.body.data.accessToken && r.body.data.refreshToken, `register ${r.status} ${r.body.message}`);
  learner = r.body.data;
});
await check('invalid credentials rejected', async () => {
  const r = await call('POST', '/auth/login', { body: { email, password: 'wrong-pass1' } });
  expect(r.status === 401, `expected 401, got ${r.status}`);
});
await check('refresh token rotates (mobile body flow)', async () => {
  const r = await call('POST', '/auth/refresh', { body: { refreshToken: learner.refreshToken } });
  expect(r.status === 200 && r.body.data.refreshToken !== learner.refreshToken, 'refresh failed');
  const reuse = await call('POST', '/auth/refresh', { body: { refreshToken: learner.refreshToken } });
  expect(reuse.status === 401, 'old refresh token should be rejected');
  learner = { ...learner, ...r.body.data };
  const again = await login(email); // reuse detection revoked sessions — log in fresh
  learner = { ...learner, ...again };
});
await check('protected route needs token', async () => expect((await call('GET', '/auth/me')).status === 401, 'expected 401'));
await check('course catalog + filters', async () => {
  const r = await call('GET', '/courses?price=free');
  expect(r.body.data.length > 0 && r.body.data.every((c) => c.price === 0), 'free filter failed');
  const all = await call('GET', '/courses?sort=price_desc');
  paid = all.body.data.find((c) => c.price > 0);
  course = r.body.data[0];
  expect(paid, 'no paid course found');
});
await check('locked lessons hide video IDs', async () => {
  const r = await call('GET', `/courses/${paid.slug}`, { token: learner.accessToken });
  const locked = r.body.data.curriculum.filter((l) => l.locked);
  expect(locked.length && locked.every((l) => !l.youtubeId), 'locked lesson leaked youtubeId');
  const lesson = await call('GET', `/lessons/${locked[0]._id}`, { token: learner.accessToken });
  expect(lesson.status === 403, `expected 403 for locked lesson, got ${lesson.status}`);
});
await check('paid course cannot be enrolled for free', async () => {
  const r = await call('POST', '/enrollments', { token: learner.accessToken, body: { courseId: paid._id } });
  expect(r.status === 402, `expected 402, got ${r.status}`);
});
await check('free enrollment + progress', async () => {
  const e = await call('POST', '/enrollments', { token: learner.accessToken, body: { courseId: course._id } });
  expect([200, 201].includes(e.status), `enroll ${e.status}`);
  const d = await call('GET', `/courses/${course.slug}`, { token: learner.accessToken });
  const first = d.body.data.curriculum[0];
  const p = await call('POST', '/progress', { token: learner.accessToken, body: { lessonId: first._id, completed: true } });
  expect(p.body.data.enrollment.progressPercent > 0, 'progress not updated');
});
await check('checkout → forged verify is rejected', async () => {
  const c = await call('POST', '/payments/checkout', { token: learner.accessToken, body: { courseId: paid._id } });
  expect(c.status === 201, `checkout ${c.status} ${c.body.message} (is PAYMENT_PROVIDER=mock?)`);
  const v = await call('POST', '/payments/verify', { token: learner.accessToken, body: { orderId: c.body.data.orderId, payload: { mockToken: 'forged' } } });
  expect(v.status === 400, `forged payment should fail, got ${v.status}`);
});
await check('checkout → verified payment enrolls learner', async () => {
  const c = await call('POST', '/payments/checkout', { token: learner.accessToken, body: { courseId: paid._id } });
  const v = await call('POST', '/payments/verify', { token: learner.accessToken, body: { orderId: c.body.data.orderId, payload: { mockToken: c.body.data.mockToken } } });
  expect(v.body.data?.status === 'paid', `verify ${v.status} ${v.body.message}`);
  const d = await call('GET', `/courses/${paid.slug}`, { token: learner.accessToken });
  expect(d.body.data.access.isEnrolled, 'not enrolled after payment');
  const again = await call('POST', '/payments/checkout', { token: learner.accessToken, body: { courseId: paid._id } });
  expect(again.status === 409, 'double purchase should be blocked');
});
await check('learner cannot reach admin APIs', async () => {
  for (const p of ['/users', '/payments', '/dashboard/admin']) {
    const r = await call('GET', p, { token: learner.accessToken });
    expect(r.status === 403, `${p} returned ${r.status}`);
  }
});
await check('manager: content yes, payments/users no, price edits ignored', async () => {
  const m = await login('manager@auraawakening.com');
  expect((await call('POST', '/faqs', { token: m.accessToken, body: { question: 'Smoke test question?', answer: 'Yes.' } })).status === 201, 'manager could not create FAQ');
  expect((await call('GET', '/payments', { token: m.accessToken })).status === 403, 'manager saw payments');
  expect((await call('GET', '/users', { token: m.accessToken })).status === 403, 'manager saw users');
  const r = await call('PATCH', `/courses/${paid._id}`, { token: m.accessToken, body: { price: 1, shortDescription: paid.shortDescription } });
  expect(r.body.data.price === paid.price, 'manager changed price');
});
await check('trainer cannot edit a course not assigned to them', async () => {
  const t = await login('ananya@auraawakening.com');
  const mine = await call('GET', '/courses?scope=manage', { token: t.accessToken });
  const ids = new Set(mine.body.data.map((c) => c._id));
  const all = await call('GET', '/courses?limit=50');
  const other = all.body.data.find((c) => !ids.has(c._id));
  const r = await call('POST', '/lessons', { token: t.accessToken, body: { course: other._id, title: 'Sneaky lesson' } });
  expect(r.status === 403, `expected 403, got ${r.status}`);
});
await check('admin dashboard + refund revokes access', async () => {
  const a = await login(process.env.SEED_ADMIN_EMAIL || 'admin@auraawakening.com');
  expect((await call('GET', '/dashboard/admin', { token: a.accessToken })).status === 200, 'admin dashboard');
  const pays = await call('GET', '/payments?status=paid', { token: a.accessToken });
  const mine = pays.body.data.find((p) => p.user?.email === email);
  const r = await call('POST', `/payments/${mine._id}/refund`, { token: a.accessToken });
  expect(r.body.data.status === 'refunded', 'refund failed');
  const d = await call('GET', `/courses/${paid.slug}`, { token: learner.accessToken });
  expect(!d.body.data.access.canWatch, 'access not revoked after refund');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
