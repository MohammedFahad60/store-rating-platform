# STORE — Store Management & Customer Experience Platform

A full-stack platform where real businesses manage **stores**, **services** and
**bookings**, and customers **discover** stores, **book** services, **track**
their requests and leave **ratings & reviews**. Three roles share one product:

| Role    | What they can do |
|---------|------------------|
| **ADMIN** | Platform overview, create users (incl. owners), assign stores to owners, suspend/reactivate stores, view all users/stores |
| **OWNER** | Own-store dashboard (bookings, revenue, rating), manage services (price, duration, activate/deactivate), accept/reject/start/complete bookings, read reviews |
| **USER** (customer) | Browse & search stores, view services, request bookings, track and cancel pending bookings, rate & review stores after a completed visit |

---

## Tech stack

**Backend** — Node.js · Express 5 · Sequelize 6 · MySQL 8 (mysql2) · JWT ·
bcryptjs · helmet · cors · express-rate-limit · validator

**Frontend** — React 19 · Vite 8 · React Router 7 · Tailwind CSS 4 · Axios ·
Lucide icons

---

## Database policy (important)

```
TEST DATABASE                = SQLite (automated tests only)
DEVELOPMENT/PRODUCTION DB    = MySQL 8 (mysql2 + Sequelize, utf8mb4)
```

- `DB_DIALECT` defaults to **mysql**. SQLite is only used when
  `DB_DIALECT=sqlite` is explicitly set (the E2E test runner does this).
- **Production refuses to boot with SQLite** and **refuses to boot when the
  schema is missing** — it never creates/alters/destroys the schema.
- **Schema is managed by real migrations** (`npm run db:migrate`).
  `sequelize.sync({ alter: true })` is never used by the application.

---

## Architecture

```
┌─────────────────────┐       ┌──────────────────────────────────────────┐
│  React SPA (Vite)   │  JWT  │  Express API                             │
│  src/pages,         │ ─────▶│  /api/auth /stores /services /bookings   │
│  src/services/api   │ Bearer│  /ratings /owner /admin /health          │
└─────────────────────┘       └──────────────┬───────────────────────────┘
                                             │ Sequelize 6
                                             ▼
                          MySQL 8 (production) · SQLite (tests only)
```

- **Auth flow:** `POST /api/auth/login` returns a JWT
  (`{id, role, tv}`) plus user info; the frontend stores it and sends
  `Authorization: Bearer <token>`. Passwords are bcrypt-hashed and never
  leave the backend.
- **Token invalidation:** JWTs carry a `tokenVersion`; changing the password
  increments it, so every previously issued token is rejected immediately.
- **Authorization:** every protected route runs `authMiddleware` (validates
  signature/expiry, verifies the user still exists and the token version) and
  `roleMiddleware("OWNER")`-style guards. Owner/customer resources are scoped
  to the authenticated user (`storeId`/`userId` are derived from the JWT, not
  the request body) — users can never act on another owner's store or another
  customer's booking/rating.
- **Error contract:** `{ success: false, message, errors? }` with proper HTTP
  codes (400/401/403/404/409/422/500), handled centrally.

## Folder structure

```
STORE/
├── Backend/
│   ├── app.js                  # Express: security, health, routes, errors
│   ├── server.js               # Boot: env validation, prod schema check,
│   │                           #       graceful shutdown (SIGINT/SIGTERM)
│   ├── seed.js                 # Deterministic demo data (safe to re-run)
│   ├── config/db.js            # Sequelize (MySQL 8 default / SQLite tests)
│   ├── models/                 # User, Store, Service, Booking, Rating
│   ├── migrations/             # 0001-0005 (production schema, reproducible)
│   ├── controllers/            # auth, store, service, booking, rating, admin, health
│   ├── routes/                 # REST routes with role middleware
│   ├── middleware/             # authMiddleware (JWT + token version), roleMiddleware
│   ├── utils/                  # migrate (runner), validators, http, sanitize
│   └── scripts/
│       ├── migrate.js          # npm run db:migrate | db:migrate:status
│       ├── sync-db.js          # legacy alias of db:migrate
│       └── e2e-verify.js       # 87-check API end-to-end suite (SQLite)
└── Frontend/
    ├── src/services/api.js     # Axios: VITE_API_URL or relative /api
    ├── vite.config.js          # dev proxy: /api -> backend
    ├── src/components/         # UI kit, AppLayout, ProtectedRoute, RatingModal
    ├── src/pages/              # role-scoped pages (admin/owner/customer)
    └── .env.example
```

---

## Prerequisites

- Node.js ≥ 20 (tested on 22)
- MySQL 8 (skip for the SQLite test-only setup)
- npm

---

## Setup — MySQL 8 (development / production)

### 1. Backend

```bash
cd Backend
npm install
cp .env.example .env          # fill in DB_*, JWT_SECRET, CLIENT_URL
```

Create the database:

```sql
CREATE DATABASE store_rating_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Apply migrations and seed demo data **in this order** (both are idempotent):

```bash
npm run db:migrate            # creates all tables, FKs, indexes, constraints
npm run db:migrate:status     # shows applied / pending migrations
npm run seed                  # deterministic demo data (bcrypt passwords)
```

Start the API:

```bash
npm run dev                   # development (nodemon)
npm start                     # production-style start
```

### 2. Frontend

```bash
cd Frontend
npm install
npm run dev                   # http://localhost:5173 (proxies /api -> :5000)
```

API configuration is environment-driven:

- **Development (default):** the app uses the relative `/api` origin and the
  Vite dev server proxies `/api/*` to `http://localhost:5000` (override with
  `VITE_PROXY_TARGET`).
- **Production:** set `VITE_API_URL=https://your-api.example.com/api` at build
  time for static hosting on a different origin, or keep `/api` when the
  frontend and API share an origin / reverse proxy.

```bash
npm run build                 # production build (Frontend/dist)
npm run preview               # preview the build
```

### 3. Deployment order (production)

```bash
# on the API host, with the production .env (DB_*, JWT_SECRET, CLIENT_URL)
npm ci
npm run db:migrate            # migration → application startup
npm run seed                  # optional: only for the first environment
NODE_ENV=production npm start
```

Production startup NEVER calls `sync({ alter: true })` and never drops or
alters a table. It verifies that every required table exists and starts only
then.

---

## Setup — SQLite (automated tests only)

```bash
cd Backend
DB_DIALECT=sqlite npm run test:e2e
```

This runs the real HTTP API + Sequelize against a throwaway SQLite file and
then deletes it. It is **not** a MySQL equivalence test — it verifies
application logic. MySQL compatibility is audited statically (see
`docs/MYSQL_COMPATIBILITY_AUDIT.md`).

---

## Demo credentials (after `npm run seed`)

| Role     | Email                    | Password    |
|----------|--------------------------|-------------|
| Admin    | `admin@storerating.com`  | `Admin@123` |
| Owner 1  | `owner1@storerating.com` | `Owner@123` |
| …owners  | `owner2@…` … `owner6@…`  | `Owner@123` |
| Customers| `aisha@gmail.com` … (`rohan`, `karan`, `pooja`, `ananya`, `rakesh`, `divya`, `imran`) | `User@123` |

Each owner owns one store (Glow & Groom Salon, TechFix, FitZone, LensPro,
Sparkle & Shine, AutoCare) with 4 services, seeded bookings in every status,
and reviews. Aisha & Pooja have completed but **unrated** visits at Glow for
trying the rate/review flow.

---

## Database schema (managed by migrations)

```
User ──┬── owns ──▶ Store ──┬── has ──▶ Service
       │   (ownerId)        │   (storeId)
       │                    └── has ──▶ Booking ──▶ Service  (serviceId)
       └── books ──▶ Booking    (userId)
       └── reviews ─▶ Rating    (userId + storeId, unique pair)
```

- **Ratings** link to the completed **Booking** (`bookingId`, `ON DELETE SET
  NULL`). Unique `(userId, storeId)` prevents duplicate reviews; ratings are
  only accepted after a completed booking at that store.
- **Bookings** store a `price` snapshot of the service at booking time.
- Key indexes: `Users.email` (unique), `Stores.ownerId/name/category/status`,
  `Services.storeId(+active)`, `Ratings.storeId`, `Ratings(userId,storeId)`
  (unique), `Bookings.userId/storeId+status/serviceId/bookingDate`.
- `Users.tokenVersion` (+ `passwordChangedAt`) supports JWT invalidation on
  password change.

---

## API overview

See `docs/API_CONTRACT.md` for the complete method/URL/auth/body/response
contract. Summary:

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | public | Customer sign-up (role USER) |
| POST | `/api/auth/login` | public | Login → JWT |
| PUT | `/api/auth/change-password` | any role | Change own password (invalidates old tokens) |
| GET | `/api/users/profile` | any role | Own profile (safe fields) |
| GET | `/api/stores` | auth | Discovery: `search, category, minRating, sort, page, limit` |
| GET | `/api/stores/:id` | auth | Store detail + stats |
| GET | `/api/services/store/:storeId` | auth | Store's services (customers see active only) |
| GET | `/api/services/my-store` | OWNER | Owner's store + all its services |
| POST | `/api/services` | OWNER | Create service (store from JWT) |
| PUT | `/api/services/:id` | OWNER | Update / activate (`active`) |
| DELETE | `/api/services/:id` | OWNER | Deactivate (soft) |
| GET | `/api/bookings/my` | USER | Own bookings w/ store & service names |
| POST | `/api/bookings` | USER | Request booking `{serviceId, bookingDate, notes}` |
| PUT | `/api/bookings/:id/cancel` | USER | Cancel own pending booking |
| GET | `/api/bookings/store?status=` | OWNER | Bookings for own store |
| PUT | `/api/bookings/:id/status` | OWNER | PENDING→CONFIRMED/REJECTED, CONFIRMED→IN_PROGRESS, IN_PROGRESS→COMPLETED |
| GET | `/api/ratings/store/:storeId` | auth | Summary + distribution + reviews |
| POST | `/api/ratings` | USER | Rate/review store (needs a completed booking) |
| PUT | `/api/ratings/:id` | USER | Edit own rating/review |
| GET | `/api/owner/dashboard` | OWNER | Stats, recent bookings & reviews |
| GET | `/api/admin/dashboard` | ADMIN | Platform totals |
| GET/POST | `/api/admin/users` · `GET /api/admin/users/:id` | ADMIN | Manage users |
| GET/POST | `/api/admin/stores` | ADMIN | Manage stores |
| PUT | `/api/admin/stores/:id/status` | ADMIN | Suspend / activate stores |
| GET | `/api/health` | public | Liveness/DB readiness (no secrets) |

Booking statuses: `PENDING → CONFIRMED → IN_PROGRESS → COMPLETED`, plus
`CANCELLED` (customer or owner) and `REJECTED` (owner).

---

## Environment variables

### Backend

| Variable | Purpose |
|---|---|
| `PORT` | API port (default 5000) |
| `NODE_ENV` | `production` disables schema sync, dev logging, and enables strict config checks |
| `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` | MySQL 8 connection (`DB_PASSWORD` required in production) |
| `DB_DIALECT` | `mysql` (default) or `sqlite` (**tests only**) |
| `DB_LOGGING` | Optional SQL logging (keep `false` in production) |
| `JWT_SECRET` | Token signing secret — **≥ 32 random chars, required in production** |
| `JWT_EXPIRES_IN` | e.g. `1d`, `8h` (default `1d`) |
| `CLIENT_URL` | Comma-separated allowed CORS origins — **required in production** |

### Frontend

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Full backend URL incl. `/api` at build time (default: relative `/api`) |
| `VITE_PROXY_TARGET` | Dev-server API target (default `http://localhost:5000`) |
| `VITE_ALLOWED_HOSTS` | Optional dev-server host allowlist |

---

## Verification

```bash
# Backend: boots a real HTTP server on SQLite and runs the whole workflow
# (auth, roles, service CRUD, booking lifecycle, ratings, dashboards, admin,
#  health, JWT security incl. password-change token invalidation, IDOR,
#  validation, migration idempotency):
cd Backend && npm run test:e2e      # 193/193 checks
cd Backend && npm run lint          # 62/62 files syntax-checked

# Real MySQL integrity (run against a MySQL 8 instance; see
# docs/MYSQL8_VERIFICATION.md for the full runbook):
DB_HOST=... DB_NAME=... DB_USER=... DB_PASSWORD=... \
  npm run db:verify:mysql -- --integrity

# Read-only live smoke against real MySQL (health, stores, login):
DB_HOST=... DB_NAME=... DB_USER=... DB_PASSWORD=... \
  npm run db:smoke:mysql

# Frontend:
cd Frontend && npm run lint && npm run build

# Real-browser journeys (customer/owner/admin) — requires Chromium:
cd Frontend && npm run test:e2e:browser   # Playwright, dev-only
```

## Deployment (Phase 5)

> **Phase 5 status:** `render.yaml`, `vercel.json`, `netlify.toml`, `Backend/Dockerfile` are committed — the project is **prepared forproduction, DEPLOYMENT BLOCKED BY ENVIRONMENT/CREDENTIALS** in this sandbox (no managed MySQL, no Vercel/Render tokens). See `docs/PHASE5_PRODUCTION_DEPLOYMENT_REPORT.md` for the full gate (backend/frontend URLs, MySQL version, migrations, integrity, health, browser, security, logs, rollback, score).

**Provider-agnostic guide:** `docs/DEPLOYMENT.md` (env vars, MySQL migration order, health checks, TLS, Render/Railway/AWS/Vercel/Netlify/VM options). Backend production startup never syncs, alters, resets or seeds — it only verifies `schemaReady()`.

**Declarative configs (no secrets committed):**
- `render.yaml` — Render web service `store-api` (Node, `Backend`, `healthCheckPath: /api/health`, `preDeployCommand: npm run db:migrate`) + optional `store-web` static + `store-mysql` managed MySQL 8. Set `DB_*`/`JWT_SECRET`/`CLIENT_URL` as `sync:false` in the dashboard.
- `vercel.json` — Vercel Vite frontend (`Frontend/dist`, rewrites `/api/*` → `https://api.example.com/api/*`).
- `netlify.toml` — Netlify frontend (`base: Frontend`, `publish: dist`, same redirects).
- `Backend/Dockerfile` — any Docker host (Railway/Fly/AWS ECS/EC2) with `HEALTHCHECK wget /api/health`.

**First staging deploy after provisioning (exact):** `CREATE DATABASE` → `DB_HOST=... npm run db:migrate` → `db:migrate:status` (12/12) → `db:verify:mysql -- --integrity` (74/74) → `db:smoke:mysql` → `curl /api/health` (200) → `npm test` (193/193) → `Frontend: npm run test:e2e:browser` (5/5).

See `docs/PHASE5_PRODUCTION_DEPLOYMENT_REPORT.md` §12 for the full env table and §14 for rollback.

---

## Security notes

- Passwords hashed with bcrypt; hashes and `passwordChangedAt`/`tokenVersion`
  are excluded from every response.
- JWT signature/expiry checked on every request; tokens are invalidated
  immediately when the password changes (`tokenVersion`).
- Roles are enforced server-side; owner/customer resources are scoped to the
  authenticated user (IDOR-safe: an owner cannot touch another store's
  services/bookings; a customer cannot cancel another customer's booking or
  edit another user's rating).
- SQL injection: parameterized Sequelize queries and `replacements` only.
- helmet, configurable per-origin CORS (`CLIENT_URL`), auth rate limiting
  (100/15 min) and global API rate limiting (300/15 min), 1 MB JSON body
  limit, centralized error handler that never leaks stack traces, SQL
  internals or DB credentials.
- Rating abuse prevention: requires a completed booking; one review per
  (user, store); multi-step writes run in transactions.
- `GET /api/health` reports only `status`/`database`/`uptime` — no
  credentials, hosts or connection details.
- Graceful shutdown: `SIGINT`/`SIGTERM` close the HTTP server and the
  Sequelize pool cleanly (10 s force-exit safeguard).

## Troubleshooting

- **Missing required environment variable** → copy `.env.example` to `.env`.
- **`ER_ACCESS_DENIED_ERROR`** → wrong `DB_USER`/`DB_PASSWORD`, or create the
  database first.
- **Schema missing at startup** (production) → run `npm run db:migrate`.
- **CORS errors in the browser** → `CLIENT_URL` must contain the exact
  frontend origin.
- **Services page shows “No store is assigned”** → the owner has no store yet;
  an ADMIN assigns one under Admin → New Store.
- **Sandbox without MySQL** → run `npm run test:e2e` (SQLite, tests only);
  production still requires MySQL 8.

See:
- `docs/PRODUCTION_READINESS_REPORT.md` — Phase-2 audit results.
- `docs/PRODUCTION_DEPLOYMENT_READINESS_REPORT.md` — Phase-4 final readiness
  report (score /100, honest MySQL verification status).
- `docs/DEPLOYMENT.md` — production deployment guide.
- `docs/MYSQL8_VERIFICATION.md` — exact real-MySQL-8 test procedure.
- `docs/SECURITY_AUDIT.md` — Phase-4 security audit checklist.
- `docs/API_CONTRACT.md` — full API contract.
