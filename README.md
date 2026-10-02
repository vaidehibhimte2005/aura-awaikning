# Aura Awakening

Premium wellness website + LMS + live-learning platform built on the MERN stack.

**Public site** (home, about, programs, course details, trainers, live sessions, events, journal, contact, FAQ, legal pages) ·
**LMS** (catalog with search/filter/sort, curriculum, YouTube lesson player, progress, resume, certificates) ·
**Live sessions** on YouTube Live (upcoming → live → recording) ·
**Payments** (Razorpay / Stripe / dev mock, verified server-side) ·
**Four roles** — Admin, Content & Live Manager, Trainer, Learner — each with its own dashboard ·
**CMS** for homepage, about and legal copy.

```
aura-awakening/
├── server/   Express + Mongoose REST API (API-first: web today, React Native/Capacitor tomorrow)
└── client/   React 18 + Vite SPA
```

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

# 3. Seed demo data (admin, manager, 3 trainers, learner, 5 courses, sessions, articles…)
npm run seed

# 4. Run (two terminals)
npm run dev:server     # http://localhost:5000
npm run dev:client     # http://localhost:5173  (proxies /api to :5000)
```

Demo logins (password `ChangeMe@123`, or `SEED_ADMIN_PASSWORD` if you set it):

| Role | Email | Lands on |
|---|---|---|
| Admin | admin@auraawakening.com | `/admin` |
| Content & Live Manager | manager@auraawakening.com | `/manager` |
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

1. MongoDB Atlas (or managed Mongo). Set `NODE_ENV=production` in the API environment (indexes are built by `npm run seed` or by running once with `NODE_ENV=development`; in production `autoIndex` is off — run `node -e "import('./src/config/db.js').then(async m=>{await m.connectDB();const M=await import('./src/models/index.js');for(const k of Object.keys(M))await M[k].syncIndexes?.();process.exit(0)})"` from `server/` after deploys that add indexes).
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
