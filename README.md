# Aura Awakening

Live one-to-one training platform on the MERN stack: public landing page, **three role-based modules (Admin · Trainer · Learner)**, daily/weekly/monthly packages, trainer-published slot booking, meeting links, attendance-based training-day counting, verified payments and trainer payouts.

```
aura-awakening/
├── server/   Express + Mongoose REST API
└── client/   React 18 + Vite SPA
```

> The earlier LMS code (courses, lessons, YouTube live) is still in the repository and its API routes still exist, but it is no longer linked from the navigation. The retired Manager role and the trainer self-application flow are disabled (`/api/trainer-applications` answers 403). Trainer accounts are created only by an Admin.

**Jump to:** [Training platform guide](#training-platform-guide) · [Environment variables](#environment-variables) · [Tests](#tests)

---

## 1. Quick start (local)

Requirements: **Node 18.18+** and **MongoDB 6+** (local or Atlas).

```bash
# 1. Install
npm run install:all

# 2. Configure the API
cp server/.env.example server/.env
#   → set MONGO_URI, JWT_SECRET and JWT_REFRESH_SECRET (long random strings):
#     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Seed demo data (admin, 3 trainers with published slots, learner, packages, legacy demo content)
npm run seed

# 4. Run (two terminals)
npm run dev:server     # http://localhost:5000
npm run dev:client     # http://localhost:5173  (proxies /api to :5000)
```

Demo logins (password `ChangeMe@123`, or `SEED_ADMIN_PASSWORD` if you set it):

| Role | Email | Lands on |
|---|---|---|
| Admin | admin@auraawakening.com | `/admin` |
| Trainer | ananya@auraawakening.com | `/trainer` |
| Learner | learner@auraawakening.com | `/dashboard` |

> Change these passwords immediately on any shared or production database.
> Seeded lessons use one demo YouTube video — replace with your own from the trainer/admin curriculum editor.

### Tests

```bash
npm test                          # unit tests (YouTube parsing, slugs, RBAC) — no DB needed
cd server && npm run seed:reset   # fresh demo DB (dev only)
npm run dev                       # with PAYMENT_PROVIDER=mock
npm run test:smoke                # end-to-end API test: auth, refresh rotation, catalog,
                                  # locked-video protection, enrollment, progress, forged vs.
                                  # verified payment, refunds, and role denials
```

---

## 2. Architecture

### Backend (`server/src`)
```
config/        env (fails fast on missing secrets), db, permissions (RBAC map)
models/        User, Trainer, Category, Course, Lesson, Enrollment, LessonProgress,
               LiveSession (sessions + events), Order, Payment, Certificate, Notification,
               content.js (Article, FAQ, Testimonial, Announcement, ContactMessage, SiteSetting)
middleware/    auth (protect / optionalAuth / requireRole / requirePermission), validate (zod),
               rateLimit, error
services/      payments/ (razorpay, stripe, mock + registry), paymentService, learningService
               (enroll, progress, certificates), accessService (ownership), tokenService,
               notificationService (in-app + email; SMS/WhatsApp/push adapters), storageService
controllers/   one per domain + crudFactory for simple content
routes/        /api/auth, users, trainers, courses, categories, lessons, enrollments, progress,
               live-sessions, payments, orders, certificates, articles, faqs, testimonials,
               announcements, notifications, settings, contact, dashboard, uploads, sitemap.xml
validators/    zod schemas for every write
seed/          seed.js + defaultSettings.js (CMS defaults)
```

All responses: `{ "success": true, "data": …, "meta"?: {pagination} }` or `{ "success": false, "message": "…", "errors"?: [{field,message}] }`.

**Why no separate `Role` / `Permission` collections?** Roles live on `User.role`; the role → permission map lives in `config/permissions.js`, and `User.extraPermissions` grants one-off permissions (e.g. a manager who may also view payments). This keeps RBAC in a single, version-controlled place with no sync problems. **Events** reuse `LiveSession` (`kind: 'event'`) instead of a duplicate collection.

### Frontend (`client/src`)
```
components/   Navbar, Footer, Layout, Button, CourseCard/CourseGrid, TrainerCard, LiveSessionCard,
              YouTubePlayer, Modal/ConfirmDialog, States (Loader/EmptyState/ErrorState/Skeleton),
              Form controls, Pagination, Progress, ProtectedRoute
pages/        public pages, auth, LessonPlayer, Checkout, Certificate
dashboard/    learner area
panel/        PanelLayout (shared sidebar), ResourceManager (config-driven CRUD), FormBuilder,
              CurriculumEditor, resources.jsx (field/column configs per role)
admin/        dashboards + management screens (reused by manager and trainer panels), SiteContent CMS
context/      Auth (in-memory access token + httpOnly refresh cookie), Site settings, Toasts
hooks/        useFetch, useDebounce, useSeo
```

---

## 3. Security

- bcrypt (12 rounds) password hashing; passwords never selected by default
- Short-lived JWT access tokens (memory only, never localStorage) + rotating refresh tokens stored **hashed**; refresh-token reuse revokes all sessions
- Browser: refresh token in `httpOnly`, `secure` (prod) cookie scoped to `/api/auth`. Mobile: send `X-Client: mobile` to receive/send the refresh token in the body — same API, same user DB
- RBAC enforced on the server for every route; trainers can only touch courses/sessions assigned to them (checked per request in `accessService`); managers' course edits are whitelisted to presentation fields
- Locked lesson video IDs are never sent to users without access
- zod validation on every write, `express-mongo-sanitize`, escaped regex search, helmet headers, CORS allow-list, rate limits (stricter on auth & contact), honeypot on contact form, 1 MB body limit
- Uploads: type allow-list + magic-byte sniffing + size limit + sanitised filenames + permission check
- Payments: price always read from the DB; Razorpay HMAC signature + amount check, Stripe session retrieval, webhook signature verification on the raw body; idempotent finalisation (webhook and client verify can race safely)
- No secrets in React — only `VITE_*` public values; `.env` is git-ignored

---

## 4. Payments

Set `PAYMENT_PROVIDER` in `server/.env`:

| Value | Needs | Notes |
|---|---|---|
| `mock` | nothing | Dev only (refused when `NODE_ENV=production`). Server still verifies a signed token. |
| `razorpay` | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Webhook URL: `https://<api>/api/payments/webhook/razorpay` (events `payment.captured`, `payment.failed`) |
| `stripe` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Webhook URL: `https://<api>/api/payments/webhook/stripe` (`checkout.session.completed`, `checkout.session.expired`) |

Flow: `POST /payments/checkout` → provider UI → `POST /payments/verify` (server verifies with provider) → Payment `paid` → Order `paid` → Enrollment → course unlocked. Admin refunds call the provider and revoke the enrollment.
Add a provider by creating `services/payments/<name>Provider.js` with `createCheckout / verify / parseWebhook / refund` and registering it in `services/payments/index.js`.

---

## 5. Production deployment

1. MongoDB Atlas (or managed Mongo). Set `NODE_ENV=production` for the API. Production disables Mongoose `autoIndex`, so run `npm run db:indexes` (from `server/`) once after the first deploy and after any deploy that adds indexes.
2. API (Render / Railway / EC2 / DigitalOcean): `npm ci && npm start`, set every variable from `.env.example`. `CLIENT_URL` must list the exact site origin(s). Serve behind HTTPS.
3. Client: `npm run build` → deploy `client/dist` to Netlify / Vercel / S3+CloudFront with SPA fallback to `index.html`. Set `VITE_API_URL=https://api.yourdomain.com` at build time. If the API is on a different site (domain), cookies use `SameSite=None; Secure` automatically in production.
4. Point Razorpay/Stripe webhooks at the API. Configure SMTP for email notifications.
5. Uploads default to local disk (`server/uploads`). For multi-instance hosting, implement the `cloudinary` or `s3` driver stub in `services/storageService.js` and set `STORAGE_DRIVER`.
6. SEO: `GET /api/sitemap.xml` lists every public page, course, article and trainer. For full crawler rendering of the SPA, add prerendering (e.g. at the CDN) or migrate public pages to SSR later — the API does not need to change.

---

## 6. Environment variables

Server: see `server/.env.example` (`PORT, NODE_ENV, CLIENT_URL, API_URL, SITE_URL, MONGO_URI, JWT_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_EXPIRES, JWT_REFRESH_EXPIRES_DAYS, PAYMENT_PROVIDER, DEFAULT_CURRENCY, RAZORPAY_*, STRIPE_*, YOUTUBE_API_KEY, SMTP_*, MAIL_FROM, STORAGE_DRIVER, UPLOAD_MAX_MB, SEED_ADMIN_*`).
Client: `client/.env.example` (`VITE_API_URL, VITE_SITE_URL`) — public values only.

## 7. Mobile readiness
The API is the product. A React Native / Capacitor app uses the same endpoints and the same accounts: log in with header `X-Client: mobile`, store the returned `refreshToken` in secure storage, and call `/api/auth/refresh` with it in the body. `User.authProviders` and `User.phone` are already in place for Google, Apple and phone-OTP sign-in (`/api/auth/google`, `/apple`, `/otp/*` currently return 501 until implemented).

## 8. Roadmap hooks already in place
PDF certificate generation (`Certificate.fileUrl`), SMS/WhatsApp/push adapters (`notificationService`), cloud storage drivers, OTP/social login, YouTube Data API metadata (`YOUTUBE_API_KEY`).


---

## 9. Registration, approvals & notifications

### Accounts
| Who | How they join | Access |
|---|---|---|
| Learner | `/register/learner` — instant, no approval | Learner dashboard, purchase courses |
| Trainer | `/register/trainer` — creates an application (`AA-TR-YYYYMMDD-XXXXXX`, status `PENDING`) | **Nothing** until a manager approves; they only see `/trainer/application` |
| Manager / Admin | Created by an admin in **Admin → Users** — never via public sign-up | Role dashboards |

Login accepts an **email or mobile number** plus password. Password reset: `/forgot-password`.

### Trainer applications
`PENDING → UNDER_REVIEW → APPROVED | REJECTED | NEEDS_INFORMATION`. Rejected / needs-information applicants can edit and resubmit from their status page.
Managers act from **Manager → Trainer Applications** (search, filter by status & date, internal notes, full history). Approving publishes the trainer in the public directory and unlocks the trainer studio.

### Course lifecycle
`draft → pending_approval → under_review → approved → published` (also `rejected`, `needs_revision`, `archived`).
* Trainers create and **submit**; only a manager (`courses:review`) can approve / reject / request changes; the trainer then **publishes** an approved course.
* Course `status` can never be set through a normal edit — only through `/api/courses/:id/{submit,review,publish,unpublish}`.
* If a trainer edits a course that was already reviewed or live, it goes back to `draft` and must be re-approved, so unreviewed changes are never public. Enrolled learners keep access.

### Who may approve
Operational approvals (`trainers:review`, `courses:review`) belong to the **manager** role. The admin role has audit visibility (applications, history, activity log) but is **not** implied to approve. To authorise a specific admin, edit them in **Admin → Users** and tick the extra permissions.

### Notifications
Created by backend events (application submitted/decided, course submitted/decided/published, enrollment, payment, refund), stored per recipient, de-duplicated with an idempotency key, shown by the bell in every panel and at `/<panel>/notifications`. Emails go out when SMTP is configured.

### Email verification
Enforced only when SMTP is configured (or `REQUIRE_EMAIL_VERIFICATION=true`). Without mail credentials, links are printed to the server console in development.

### Sample courses
`npm --prefix server run seed:demo` adds six clearly-labelled sample courses (idempotent — safe to re-run; prices are illustrative). They are editable like any other course.

### API additions
`POST /auth/{verify-email,resend-verification,forgot-password,reset-password}` · `POST /trainer-applications` · `GET|PATCH /trainer-applications/me` · `GET /trainer-applications[/:id]` · `POST /trainer-applications/:id/{review,notes}` · `POST /courses/:id/{submit,review,publish,unpublish}` · `GET /courses/:id/history` · `GET /activity-logs` · `GET /dashboard/learners`.

### Tests
`npm --prefix server test` (unit) and `npm --prefix server run test:workflow` (end-to-end journey against a throw-away MongoDB database).

---

# Training platform guide

## Modules

| Role | Area | What they do |
|---|---|---|
| **Admin** | `/admin` | Register/activate/deactivate trainers (no self-registration), manage learners, packages, base daily rate, discounts, per-trainer payout rate, attendance policy; monitor payments, bookings, attendance, package usage/expiry; resolve exceptions; approve and mark payouts paid; broadcast notifications; audit log |
| **Trainer** | `/trainer` | Publish slots (e.g. four 1-hour sessions a day), see bookings + learner contact + meeting links, cancel with a reason, see earnings/payout status, edit public profile |
| **Learner** | `/dashboard` | Register (landing page or `/register`), buy a plan, see price/discount/savings, book trainer slots, view package start/expiry/remaining days, bookings, history, payments, renew/upgrade |

Public landing page (`/`): hero, about, benefits, features, how it works, trainers, live plans (priced by the server), FAQ, and the **enrollment form at the very bottom**.

## Business rules (all enforced on the server)

* **Pricing** — nothing is hard-coded. `price = dailyRate × trainingDays − discount`, calculated from the admin's *current* settings (`TrainingConfig`) and each package's discount (percent or fixed). Defaults seeded on first run: ₹1,000/day; Daily 0%, Weekly 10%, Monthly 20%; trainer payout ₹500/session. Changing the rate re-prices every plan immediately; an order locks the price at checkout.
* **Training days** — a booking does not use a day, and neither does a date passing. A day is used only when a session is **completed** under the policy: trainer joined, learner joined, each present ≥ `minAttendancePct` of the session and together ≥ `minOverlapPct`. Mon + Thu completed with Tue/Wed idle = **2** days used. The calendar expiry (`expiresAt`) is independent of days used.
  * Trainer never joined → `trainer_no_show`: no day used, no earning, admins notified.
  * Learner never joined → `learner_no_show`: no day used; trainer paid only if the admin enabled `payTrainerOnLearnerNoShow`.
  * Both joined but too briefly → `needs_review`: the day stays reserved until an admin resolves it (complete / technical failure / no-show).
  * Two completed sessions on the same calendar day (if the admin allows >1 per day) use **one** day (unique ledger index), both trainers are paid.
* **Booking** — no trainer acceptance step. A learner can only book `available`, published slots. Double-booking is prevented by an atomic `available → booked` claim, a partial unique index on `Booking.slot`, and a unique `(trainer, start)` slot index. A booking reserves one training day atomically (`$expr` guard), so a learner can never hold more bookings than days left. Learners cancel/reschedule up to `cancelCutoffHours` before the start; trainers cancel with a reason (slot is withdrawn, the learner keeps the day); booked slots can't be deleted.
* **Idempotency** — one subscription per order, one usage row per booking and per (subscription, day), one earning per booking, unique notification keys, unique provider-event ids. The scheduler (every minute) evaluates finished sessions, repairs half-applied settlements, sends session/expiry reminders and expires packages; every step is safe to repeat.
* **Payments** — the server prices the order, the provider verifies the signature/transaction (`/api/payments/verify`, webhooks), and only then is the subscription created. The client claiming "paid" is ignored. Renew (starts when the current package ends) is allowed when ≤ `renewal.remainingDays` days remain or within `renewal.windowDays` of expiry; upgrade (starts now) requires a bigger plan.
* **Payouts** — `pending → approved → paid` (or `failed → pending`), admin only, guarded atomic transitions. "Paid" is the admin's record that they paid the trainer outside the system; **no money is moved by this software**.

## Meetings and attendance

* `MEETING_PROVIDER=demo` (default): **no real meeting is created.** The "link" opens an in-app demo room (`/session/:id`) clearly labelled as demo; clicks there are stored as `source: demo`. Demo attendance counts only if the admin leaves *Count demo-room attendance* on (default on in development, **off in production**).
* `MEETING_PROVIDER=zoom` + the four `ZOOM_*` variables: meetings are created through the Zoom API and attendance comes from signed `meeting.participant_joined/left` webhooks (`POST /api/meetings/webhook/zoom`), matched to the booking by meeting id and participant e-mail. **This Zoom code follows Zoom's documented API but was not run against a live Zoom account here — test it before relying on it.**
* Meeting links are returned only to the booking's learner/trainer (and admins); learners never receive the host (start) link.

## API summary (new)

`GET /api/packages` · `POST/PATCH/DELETE /api/packages` (admin) · `GET/PUT /api/training-config` (admin) · `GET /api/subscriptions/me` · `POST /api/subscriptions/checkout` → `POST /api/payments/verify` · `GET /api/slots/trainers|available|mine` · `POST/DELETE /api/slots` (trainer) · `GET/POST /api/bookings`, `POST /api/bookings/:id/cancel|reschedule|attendance` · `GET/PATCH /api/trainer/profile`, `GET /api/trainer/earnings` · `/api/admin/*` (overview, trainers, learners, subscriptions, bookings + resolve, reports/sessions, payments, payouts approve/mark-paid/mark-failed/reopen).

## Environment variables

See `server/.env.example`. Required: `MONGO_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`. Payments: `PAYMENT_PROVIDER` (`mock` for development only — refused in production; `razorpay` or `stripe` with their keys). Meetings: `MEETING_PROVIDER`, `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_WEBHOOK_SECRET`. Email (optional): `SMTP_*`. Client: `VITE_API_URL` (optional).

## Run

```bash
npm run install:all
cp server/.env.example server/.env   # fill the secrets
npm run seed                          # admin, 3 trainers + slots, learner, packages
npm run dev:server                    # http://localhost:5000
npm run dev:client                    # http://localhost:5173
```

An empty database also works: on boot the API creates the default settings and the Daily/Weekly/Monthly packages if none exist. Create trainers in **Admin → Trainers**.

## Tests

```bash
cd server
npm test                 # unit tests: attendance policy, pricing, timezone, slot expansion, RBAC (no DB)
npm run test:training    # end-to-end API tests against a throw-away MongoDB database (aura_training_test)
```

`test:training` drops `aura_training_test` on every run (it refuses any database name not containing "test") and needs a local MongoDB.

## Known limitations

* Zoom integration untested against a live account; demo mode never produces verified attendance.
* No payout provider: payouts are tracked, not transferred.
* Refunding a package payment cancels the subscription but does not cancel its future bookings automatically.
* UI screens were compiled (`vite build`) but not exercised in a browser in this environment; the API behaviour is covered by the tests above.
* Times are displayed in the browser's time zone; "a day" is defined in the admin-configured time zone (default Asia/Kolkata).
* The old LMS/live-session code remains in the repo but is not linked from the new navigation.
#   a u r a - a w a i k n i n g  
 