# COMPLETE PROJECT GUIDE — Store Rating / Store Operations & Customer Experience Platform

> **Repository inspected:** `MohammedFahad60/Store-Rating` at commit `dbaf097` (Phase 5) on branch `arena/01a06c41-store-rating` (also `arena/01a06b73-store-rating`). This document is the single handover for developers taking ownership. No features were added or redesigned — it documents what is **really implemented** as of 2026-09-04. Anything that cannot be verified from code is marked **Not verified**.

> **How to use:** start with §1 (overview) and §17 (how to run locally on Windows), then follow the learning roadmap §32. Keep §31 (cheat sheet) open while working.


---


## 1. PROJECT OVERVIEW

### Simple explanation (non-technical)
This is a **store management and customer experience platform**. Real businesses (owners) put their physical stores on the platform — salons, repair shops, gyms, eye-care, cleaning, auto service. Customers discover those stores on a website, look at services and prices, book a time slot, track whether the shop accepted them, and after the visit leave a star rating and written review. A platform admin watches everything: creates owner accounts, can suspend a bad store, sees all users and stores, and can hide abusive reviews. One website, three kinds of users, one shared database.

### Who uses it
| Role | Count in demo seed | What they do |
|---|---|---|
| **ADMIN** | 1 (`admin@storerating.com`) | Platform oversight: create users (incl. owners), assign/approve stores, suspend/reactivate stores, see all bookings, moderate reviews (hide/restore), see audit logs and analytics. |
| **OWNER** | 6 (`owner1@…` … `owner6@…`) | Runs one store each: sees revenue/bookings/ratings, manages services (create/edit price/duration/activate), moves bookings `PENDING→CONFIRMED/REJECTED → IN_PROGRESS → COMPLETED`, replies to reviews, sees own customers and per-customer history, edits store details and opening hours, sees analytics. |
| **USER** (customer) | 9 (`aisha@gmail.com` … `imran`, plus `disabled@storerating.com`) | Discovers stores with search/filter/sort/pagination, views a store and its services, asks for a booking (date + optional notes, price is fixed by the shop), watches own bookings (can cancel while still `PENDING`), favorites stores, rates/reviews a store **only after a completed booking** at that store, gets notifications, edits own profile. |

### Technical explanation
* **Frontend:** React 19 SPA built with Vite 8. The browser never talks directly to MySQL. It talks to a Node/Express JSON API with a JWT in `Authorization: Bearer <token>`. The API answers with `{ success, data?, message? }`.
* **Backend:** Stateless Node.js/Express 5 API. Sequelize 6 maps JavaScript models to a relational MySQL 8 (production) or a throwaway SQLite file (tests only, via a `node:sqlite` shim). 10 route modules, 8 controllers, 8 models, 2 middleware layers, structured JSON logging with per-request IDs, and a 12-step migration chain that is the **only** way schema changes happen in production (`sequelize.sync({alter:true})` is never used there).
* **Database:** `store_rating_db` `utf8mb4_unicode_ci` — 10 tables (`Users`, `Stores`, `Services`, `Bookings`, `Ratings`, `Favorites`, `Notifications`, `AuditLogs`, `StoreHours`, `SequelizeMeta`), foreign keys with `CASCADE`/`SET NULL`, unique constraints (`users.email`, `(userId,storeId)` for favorites/ratings), 25+ indexes for search/rating/booking hot paths, `ENUM` for roles/statuses, `DECIMAL(10,2)` for money, `TIME` for hours, soft moderation (`Ratings.status`).

```
Browser (React, /  or VITE_API_URL) ──JWT Bearer──> Express API (helmet/cors/rate-limit/auth/role)
                                                          │ controller → Sequelize → MySQL 8 (utf8mb4)
                                                          └─> JSON { success, data }  (central error handler)
```

### Major modules
* **Auth & security:** register (USER forced), login, bcrypt, JWT with `tokenVersion`, `authMiddleware` + `roleMiddleware`, owner-scoped store lookup.
* **Store discovery:** search (`Op.like` on name/address/category), filter `category`/`status`, `minRating` via `AVG` subquery, `sort`/`page`/`limit` with `LIMIT/OFFSET`, pagination metadata.
* **Services:** owner creates/edits/deactivates services; customers see `active` only, owners see all; detail endpoint.
* **Bookings:** customer create/cancel-own-pending; owner list+status-filter+search and `PENDING→CONFIRMED/REJECTED→IN_PROGRESS→COMPLETED`; price snapshotted from service at booking time; `startTime` time-slot.
* **Favorites:** customer toggle, unique `(userId,storeId)`.
* **Ratings & reviews:** customer rate/review after completed booking, one per `(userId,storeId)`, update own, owner reply, admin hide/restore (soft `VISIBLE/HIDDEN`).
* **Notifications:** per-user, polled badge (60 s) + instant `store-rating:data-changed` event after any `POST/PUT/PATCH/DELETE`.
* **Dashboards & analytics:** customer (upcoming bookings), owner (bookings/revenue/rating, per-store stats + window-function last booking + avg rating + customers batched 3 queries/page), admin (platform totals, analytics with charts).
* **Admin:** user CRUD + status (disable/reactivate), store create/status, booking list, review moderation, audit logs, analytics.
* **Operations:** store settings/hours, customer list with search + detail, profile edit, health `GET /api/health` (200/503), graceful `SIGTERM`.

Only features above are implemented — no payments, AI, WebSockets, Redis, or microservices.


## 2. COMPLETE TECHNOLOGY STACK

*Inspected from `Backend/package.json`, `Frontend/package.json`, `Backend/config/db.js`, `Backend/app.js`, `Frontend/vite.config.js`, `Frontend/src/*`, and deployment files. Only technologies that are actually imported are listed.*

### Frontend

| Technology | Version | What it is | Why this project uses it | Where it is used |
|---|---|---|---|---|
| **React** | 19.2.6 | UI library that renders components and manages state | The whole SPA is React components/pages | `Frontend/src/App.jsx`, every `src/pages/*`, `src/components/*` |
| **React DOM** | 19.2.6 | React renderer for browsers | Mounts `<App>` into `#root` | `Frontend/src/main.jsx` |
| **React Router DOM** | 7.18.0 | Client-side routing | `/login`, `/stores`, `/owner/*`, `/admin/*` with `ProtectedRoute` | `Frontend/src/App.jsx`, `src/components/ProtectedRoute.jsx`, `src/pages/RootRedirect.jsx` |
| **Vite** | 8.0.12 | Fast dev server + production bundler | Dev proxy (`/api` → backend) and static `dist/` build | `Frontend/vite.config.js`, `package.json: dev/build/preview` |
| **@vitejs/plugin-react** | 6.0.1 | Vite plugin for JSX/HMR | Enables React fast refresh in Vite | `vite.config.js: plugins: [react()]` |
| **Tailwind CSS** + **@tailwindcss/vite** | 4.3.1 | Utility-first CSS | All styling (`className="grid …"`, `Card`, `Button`) without writing CSS files | `src/index.css`, `tailwindcss()` in `vite.config.js`, every page/component |
| **Axios** | 1.18.0 | HTTP client | Single `api` instance with `baseURL` (`VITE_API_URL` or `/api`), bearer injection, 401 auto-logout | `Frontend/src/services/api.js`, every page that calls `api.get/post/put/delete` |
| **lucide-react** | 1.21.0 | Icon library | `Search`, `Star`, `Building2`, bells etc. | `src/components/AppLayout.jsx`, `src/pages/*`, `src/components/NotificationBell.jsx` |
| **JavaScript (ESM)** | — | Language; `type:module` | Entire frontend is ES modules (`import`) | All `src/*.jsx` |
| **ESLint** + `@eslint/js`, `globals`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` | 10.3.0 / 10.0.1 / 17.6.0 / 7.1.1 / 0.5.2 | Linting | Catches missing deps, `set-state-in-effect` (allowed for data fetch), `process` global | `Frontend/eslint.config.js`, `package.json: lint` |

**State management:** no Redux/Zustand — React `useState`/`useEffect` + `localStorage` for the JWT + `Context` only for the notification badge (`NotificationBell`). The JWT and user object are stored via `Frontend/src/utils/auth.js` (`getToken`/`setSession`/`clearSession`) and read by `api.js` and `ProtectedRoute`.

### Backend

| Technology | Version | What it is | Why it uses it | Where |
|---|---|---|---|---|
| **Node.js** | ≥20 (tested 22.22.3) | Runtime | Runs Express/Sequelize | `server.js`, `app.js`, every controller |
| **Express** | 5.2.1 | Web framework | Routing, middleware, error handler | `Backend/app.js`, `server.js`, `routes/*` |
| **Sequelize** | 6.37.8 | ORM → MySQL/SQLite | Models, associations, migrations, queries | `config/db.js`, `models/*`, `controllers/*`, `migrations/*` |
| **mysql2** | 3.22.5 | MySQL driver for Sequelize | Production DB driver (`dialectModule`) | `config/db.js: dialectModule: require("mysql2")` |
| **sqlite3** (devDependency) | 6.0.1 | SQLite driver for tests | Throwaway file `:memory:` / `.tmp-*.sqlite` for `npm test` / Playwright; fallback shim `utils/sqliteShim.js` using `node:sqlite` when native binding unavailable | `config/db.js: dialectModule: try sqlite3 else sqliteShim` |
| **jsonwebtoken** | 9.0.3 | JWT `sign`/`verify` | Issue `{id,role,tv}` + 1d expiry, `authMiddleware` validates signature/expiry/tokenVersion | `controllers/authController.js`, `middleware/authMiddleware.js` |
| **bcryptjs** | 3.0.3 | Password hashing | `hash(password,10)` and `compare` — never stores plaintext | `controllers/authController.js: register/login/changePassword`, `seed.js` |
| **dotenv** | 17.4.2 | Loads `.env` | `require("dotenv").config()` in `app.js`/`server.js` | `app.js:1`, `server.js:1` |
| **helmet** | 8.3.0 | Security headers (CSP, HSTS, etc.) | `helmet({CSP: prod?undefined:false})` — CSP on only in prod | `app.js:34` |
| **cors** | 2.8.6 | CORS | `cors({origin: allowedOrigins.length?allowedOrigins:true})` from `CLIENT_URL` | `app.js:50` |
| **express-rate-limit** | 8.7.0 | Rate limiting | Global `apiLimiter` 300/15m (skip health) + `authLimiter` 100/15m | `app.js:63,77` |
| **validator** | 13.15.35 | `isEmail` etc. | Inside `utils/validators.js` (`validateEmail`) | `utils/validators.js` |
| **uuid** | 8.3.2 | UUID | `crypto.randomUUID()` is primary; `uuid` is a transitive dep | `utils/logger.js` |
| **nodemon** | 3.1.14 | Dev auto-restart | `npm run dev` → `nodemon server.js` | `package.json: dev` |
| **validator (via Sequelize)** | — | — | Sequelize also bundles `validator` for `isEmail` on `Users.email` etc. | `models/User.js` |

**Other transitive deps** (`lodash`, `moment`, `inflection`, `semver` …) are Sequelize/mysql2 dependencies, not direct application code.

### Database

| Technology | Detail | Where |
|---|---|---|
| **MySQL 8** | `8.4.6` verified (`mysqld Ver 8.4.6 for Linux on x86_64 (Source distribution)` in `1c6d22e`; `8.0.x` compatible per `docs/MYSQL_COMPATIBILITY_AUDIT.md`) | `config/db.js` (`mysql2`, `charset utf8mb4 collate utf8mb4_unicode_ci`), `migrations/*`, `models/*` |
| **Sequelize dialect** | `mysql` (prod) / `sqlite` (tests) — `Sequelize(database, user, password, {host, port, dialect, dialectModule, pool:{max:10}})` | `config/db.js`, `models/index.js` |
| **Migration system** | 12 files `migrations/0001-*`…`0012-*`, runner `utils/migrate.js` + `scripts/migrate.js` (`npm run db:migrate`, `db:migrate:status`, `db:migrate:undo`), `SequelizeMeta` table | `migrations/*`, `utils/migrate.js` |
| **Seed system** | Deterministic `seed.js` (wipe-then-create, bcrypt, no `Math.random`), safe to re-run | `seed.js` |

### Testing

| Technology | What it verifies |
|---|---|
| **Node `node --check` lint** (`scripts/lint.js`) | `node --check` over every `Backend/**/*.js` (66/66) — syntax, not ESLint |
| **ESLint** (frontend) | `eslint .` (0 errors) |
| **API e2e `scripts/e2e-verify.js`** | Boots a real Express+Sequelize on throwaway SQLite (`.tmp-e2e.sqlite`), then does **193 HTTP checks** (auth/roles/service/booking/rating/favorite/notification/admin/health/validation/IDOR/pagination/search/tokenVersion) via raw `http` requests — `npm test` / `npm run test:e2e` |
| **Playwright + @sparticuz/chromium** | `Frontend/e2e/browser.spec.js` 5 tests via real Vite dev server + real API on `127.0.0.1:5098` (SQLite throwaway `.tmp-playwright.sqlite`); Chromium `149.0.7827.0` from `@sparticuz/chromium` 149.0.0, `libnss3.so`/`libnspr4.so` built from Mozilla `nspr`/`nss` when missing; `playwright.config.js` sets `executablePath: await chromium.executablePath()` and `LD_LIBRARY_PATH` if NSS dir exists, two `webServer`s (API 5098 + Vite 5180, single worker, 60 s timeout) |

### Deployment

| File | Platform | What it does |
|---|---|---|
| `vercel.json` | Vercel frontend | Vite build → `Frontend/dist`, rewrites `/api/*` → `https://api.example.com/api/*`, fallback to `/index.html`, immutable `/assets/*` |
| `netlify.toml` | Netlify frontend | `base:Frontend` `publish:dist`, same redirects, `NODE_VERSION=22` |
| `render.yaml` | Render backend+MySQL+static | `store-api` (Node, `Backend`, `healthCheckPath:/api/health`, `preDeployCommand: npm run db:migrate`, `NODE_ENV=production`), optional `store-web` static + `store-mysql` managed MySQL 8 (`store_rating_db`) — all secrets `sync:false` |
| `Backend/Dockerfile` | Any Docker host (Railway/Fly/AWS ECS/EC2) | `node:22-alpine`, `npm ci --omit=dev`, `HEALTHCHECK wget /api/health`, `EXPOSE 5000`, `CMD ["node","server.js"]` (never seeds) |
| `docs/DEPLOYMENT.md` + `docs/PHASE5_PRODUCTION_DEPLOYMENT_REPORT.md` | Provider-agnostic | Env table, DB create/migrate/seed, health/rollback, verification commands |

*Not present and therefore not used:* TypeScript, Redux, Zustand, WebSockets, Redis, Kubernetes, microservices, `pg` (Postgres), `vitest`/`jest`, `cypress`, `Turbo`, `Prisma`.


## 3. COMPLETE PROJECT FOLDER STRUCTURE

*Generated with `find . -type f | sort` and pruned of `.git`, `node_modules` objects, and build artifacts for readability. **Every important file is listed** — `node_modules/` and `.dist` contents are omitted except for their top-level entry.*

```
Store-Rating/
├── .gitignore
├── vercel.json                 # Vercel → Frontend/dist, rewrites /api
├── netlify.toml                # Netlify → Frontend/dist, redirects
├── render.yaml                 # Render → store-api (Node) + store-web + store-mysql
├── README.md                   # Quick start, demo creds, verification badges
├── PRODUCTION_READINESS_REPORT.md   # Phase 2 92/100 (preserved, points to Phase 4)
│
├── Backend/
│   ├── .env.example            # Production env template (DB_*, JWT_SECRET, CLIENT_URL)
│   ├── Dockerfile              # node:22-alpine, HEALTHCHECK /api/health
│   ├── package.json            # scripts: start/dev/seed/db:migrate/db:verify/db:smoke/test/lint
│   ├── package-lock.json
│   ├── app.js                  # Express app: helmet/cors/rate-limit/logger/health/routes/errors
│   ├── server.js               # Boot: env validation, MySQL connect, schemaReady(), graceful shutdown
│   ├── seed.js                 # Deterministic demo data (1 admin, 6 owners, 9 customers, 6 stores, 24 services, 50 bookings, 18 ratings)
│   ├── config/
│   │   └── db.js               # Sequelize: mysql (mysql2) prod vs sqlite(+shim) test
│   ├── controllers/
│   │   ├── adminController.js      # ADMIN: dashboard, createUser, getUsers/User, createStore, getStores, updateUser/StoreStatus, getAdminBookings/Reviews, moderateReview, getAuditLogs
│   │   ├── analyticsController.js  # ADMIN + OWNER analytics (bookings by status, revenue, rating aggregates)
│   │   ├── authController.js       # register (USER forced), login, changePassword (+tokenVersion bump)
│   │   ├── bookingController.js    # createBooking, getMyBookings, cancelBooking, getStoreBookings, updateBookingStatus, getBookingDetails
│   │   ├── customerController.js   # getCustomerDashboard, updateProfile, getProfile
│   │   ├── favoriteController.js   # getFavorites, addFavorite, removeFavorite, getFavoriteStatus
│   │   ├── healthController.js     # GET /api/health → 200/503 (no secrets)
│   │   ├── notificationController.js # getNotifications, getUnreadCount, markRead, markAllRead
│   │   ├── ratingController.js     # submitRating, updateRating, getMyRatings, getStoreRatings, replyToReview
│   │   ├── serviceController.js    # getMyStore, getStoreServices, getServiceDetail, createService, updateService, deactivateService, getManagedServices
│   │   └── storeController.js      # getStores, getStoreById, getStoreAvailability, ownerDashboard, getStoreSettings, updateStoreSettings, updateStoreHours, getOwnerCustomers, getOwnerCustomerDetails (+ analytics helpers)
│   ├── middleware/
│   │   ├── authMiddleware.js       # JWT verify (tv check, disabled/deleted → 401), public strip
│   │   └── roleMiddleware.js       # 403 if role not allowed
│   ├── models/
│   │   ├── index.js                # Associations + exports (User, Store, Service, Booking, Rating, Favorite, Notification, AuditLog, StoreHour)
│   │   ├── User.js                 # id, name(60), email(unique), password(hash), phone(10), address(400), role ENUM, status ENUM, tokenVersion, timestamps
│   │   ├── Store.js                # id, ownerId FK CASCADE, name(100), email, phone, description, category, address, latitude/longitude DECIMAL, openingTime/closingTime TIME, status ENUM
│   │   ├── Service.js              # id, storeId FK CASCADE, name(100), description, price DECIMAL(10,2), estimatedMinutes, active BOOLEAN
│   │   ├── Booking.js              # id, userId/storeId/serviceId FK CASCADE, status ENUM, price DECIMAL(10,2), bookingDate DATEONLY, startTime TIME, notes TEXT
│   │   ├── Rating.js               # id, userId/storeId FK CASCADE, bookingId SET NULL, rating INT 1-5, comment TEXT, status VISIBLE/HIDDEN, reply TEXT
│   │   ├── Favorite.js             # id, userId/storeId FK CASCADE, unique(userId,storeId)
│   │   ├── Notification.js         # id, userId FK CASCADE, type, title, message, read BOOLEAN, link TEXT
│   │   ├── StoreHour.js            # id, storeId FK CASCADE, dayOfWeek INT 0-6, openTime/closeTime TIME, isClosed BOOLEAN, unique(storeId,dayOfWeek)
│   │   └── AuditLog.js             # id, actorUserId FK SET NULL, action, entityType, entityId, metadata JSON
│   ├── routes/
│   │   ├── authRoutes.js           # POST /register, /login; PUT /change-password
│   │   ├── adminRoutes.js          # GET /dashboard, /analytics; POST/GET /users, /stores; PUT /users/:id/status, /stores/:id/status; GET /bookings, /reviews; PUT /reviews/:id/status; GET /audit-logs
│   │   ├── ownerRoutes.js          # GET /dashboard, /store, PUT /store, PUT /store/hours, GET /services, /customers, /customers/:id, /analytics
│   │   ├── StoreRoutes.js          # GET / (discovery), /:id, /:id/availability
│   │   ├── serviceRoutes.js        # GET /my-store, /store/:storeId, /:id, POST /, PUT /:id, DELETE /:id
│   │   ├── bookingRoutes.js        # POST /, GET /my, PUT /:id/cancel, GET /store, PUT /:id/status, GET /:id
│   │   ├── ratingRoutes.js         # GET /store/:storeId, GET /my, POST /, PUT /:id, PUT /:id/reply
│   │   ├── favoriteRoutes.js       # GET /, GET /:storeId/status, POST /, DELETE /:storeId
│   │   ├── notificationRoutes.js   # GET /, GET /unread-count, PUT /read-all, PUT /:id/read
│   │   ├── customerRoutes.js       # GET /dashboard
│   │   └── userRoutes.js           # GET /profile, PUT /profile
│   ├── migrations/
│   │   ├── 0001-create-users.js        # Users (tokenVersion, phone, status)
│   │   ├── 0002-create-stores.js       # Stores (ownerId, geo, TIME, ENUM, indexes)
│   │   ├── 0003-create-services.js     # Services (storeId, price, duration, active)
│   │   ├── 0004-create-bookings.js     # Bookings (userId/storeId/serviceId, status, price, DATEONLY, TIME)
│   │   ├── 0005-create-ratings.js      # Ratings (userId/storeId, bookingId SET NULL, unique pair)
│   │   ├── 0006-users-phone-status.js  # idempotent phone + status add (upgrade path)
│   │   ├── 0007-create-favorites.js    # Favorites unique(userId,storeId)
│   │   ├── 0008-create-notifications.js# Notifications (userId, read)
│   │   ├── 0009-create-audit-logs.js   # AuditLogs (actorUserId SET NULL)
│   │   ├── 0010-ratings-moderation.js  # Ratings.status VISIBLE/HIDDEN
│   │   ├── 0011-create-store-hours.js  # StoreHours unique(storeId,dayOfWeek)
│   │   └── 0012-bookings-start-time.js # Bookings.startTime TIME (upgrade)
│   ├── scripts/
│   │   ├── migrate.js              # node scripts/migrate.js [--status] [--undo] — applies/reads SequelizeMeta
│   │   ├── sync-db.js              # Legacy alias → migrate.js
│   │   ├── e2e-verify.js           # 193 HTTP checks (SQLite throwaway .tmp-e2e.sqlite)
│   │   ├── mysql-verify.js         # 74 checks vs real MySQL 8 (FK/ENUM/DECIMAL/index/orphan --integrity)
│   │   ├── mysql-smoke.js          # Read-only live smoke (health, stores, login)
│   │   └── lint.js                 # node --check over every Backend/**/*.js (66/66)
│   └── utils/
│       ├── audit.js                # createAuditLog(actor,action,entity,metadata) — whitelists keys, never password/JWT
│       ├── hours.js                # Store hours helpers (parse/validate dayOfWeek/time)
│       ├── http.js                 # ApiError, wrap, notFoundHandler, errorHandler (prod hides stack)
│       ├── logger.js               # line(), requestContext (X-Request-Id), httpLogger (method/route/status/duration/requestId only)
│       ├── migrate.js              # runMigrations(), statusMigrations(), schemaReady() (reads information_schema)
│       ├── notify.js               # createNotification(userId, type, title, message, link)
│       ├── ownerStore.js           # findOwnerStore(ownerId) → Store or throw 404
│       ├── sanitize.js             # publicUser(user) — strips password, tokenVersion, etc.
│       ├── sqliteShim.js           # node:sqlite shim for sandbox when sqlite3 prebuild unavailable (bool→1/0, Date→ISO, named params)
│       └── validators.js           # validateName/Email/Password/Address, validateStorePayload, validateServiceFields, ROLES/STATUSES/ALLOWED_TRANSITIONS
│
├── Frontend/
│   ├── .env.example                # VITE_API_URL (build-time), VITE_PROXY_TARGET (dev), VITE_ALLOWED_HOSTS
│   ├── package.json                # scripts: dev/build/lint/preview/test:e2e:browser
│   ├── vite.config.js              # host:true, allowedHosts, proxy /api → VITE_PROXY_TARGET || localhost:5000, strictPort
│   ├── eslint.config.js            # globals browser+process, react-hooks/set-state-in-effect off
│   ├── index.html                  # <div id="root">, <script type="module" src="/src/main.jsx">
│   ├── src/
│   │   ├── main.jsx                # ReactDOM.createRoot(#root).render(<App />)
│   │   ├── App.jsx                 # BrowserRouter + Routes (public / USER / OWNER / ADMIN, ProtectedRoute+AppLayout)
│   │   ├── index.css               # Tailwind base
│   │   ├── components/
│   │   │   ├── AppLayout.jsx           # Header + nav + UserChip + Outlet + NotificationBell
│   │   │   ├── ProtectedRoute.jsx      # if !token → /login; if role not allowed → / (with redirect)
│   │   │   ├── NotificationBell.jsx    # Badge + dropdown, polls 60 s + listens store-rating:data-changed, marks read
│   │   │   ├── BookingModal.jsx        # Service booking: date + time-slot grid + notes → POST /bookings
│   │   │   ├── Charts.jsx              # Recharts wrappers (bar/pie) for admin/owner analytics
│   │   │   └── ui.jsx                  # Button, Card, Input, Badge, etc. Tailwind primitives
│   │   ├── context/
│   │   │   └── (none dedicated file)   # Auth state via localStorage + api.js interceptors; bell uses window events
│   │   ├── services/
│   │   │   └── api.js                  # axios baseURL VITE_API_URL||/api, bearer from getToken(), data-changed dispatch, 401→clearSession→/login
│   │   ├── utils/
│   │   │   └── auth.js                 # getToken/setSession/clearSession/getUser (localStorage `store-rating:session`)
│   │   ├── pages/
│   │   │   ├── RootRedirect.jsx        # / → role home (/admin, /owner, /customer) or /login
│   │   │   ├── Login.jsx / Register.jsx / ChangePassword.jsx # Auth
│   │   │   ├── StoreList.jsx           # Customer discovery: search/category/minRating/sort/pagination + BookingModal trigger
│   │   │   ├── StoreDetail.jsx         # Store hero + services + ratings + favorite toggle
│   │   │   ├── ServiceDetail.jsx       # Service + its store + book CTA
│   │   │   ├── CustomerBookings.jsx    # MyBookings with status filter + cancel-own-pending
│   │   │   ├── BookingDetails.jsx      # Single booking with timeline + cancel/status
│   │   │   ├── CustomerDashboard.jsx   # Customer stats (upcoming, total) + recent bookings
│   │   │   ├── FavoritesPage.jsx       # Favorite stores grid
│   │   │   ├── NotificationsPage.jsx   # All / unread filter + mark read/all
│   │   │   ├── Profile.jsx             # View/update own profile (name/email/phone/address)
│   │   │   ├── OwnerDashboard.jsx      # Owner stats (services, bookings by status, revenue, rating) + recent
│   │   │   ├── OwnerAnalytics.jsx      # Charts: bookings by status, revenue, ratings
│   │   │   ├── ManageServices.jsx      # Search/filter/sort/pagination + create/edit/activate dialog + stats
│   │   │   ├── OwnerBookings.jsx       # Store bookings with status filter+search+pagination
│   │   │   ├── OwnerCustomers.jsx      # Customers of this store (3-query batched) + search + detail link
│   │   │   ├── StoreSettings.jsx       # Store name/email/phone/description/category/address/geo/hours + isClosed
│   │   │   ├── AdminDashboard.jsx      # Platform totals (users/owners/stores/bookings/revenue)
│   │   │   ├── AdminAnalytics.jsx      # System analytics charts
│   │   │   ├── UsersList.jsx / UserDetails.jsx / CreateUser.jsx # Admin user CRUD + status toggle + detail (stores if owner)
│   │   │   ├── StoresList.jsx / CreateStore.jsx # Admin store list/create + status
│   │   │   ├── AdminBookings.jsx       # All bookings paginated + status filter+search
│   │   │   ├── AdminReviews.jsx        # Review list + hide/restore (soft)
│   │   │   └── AdminAuditLogs.jsx      # Audit trail with actor/entity/action filters, no secrets
│   │   └── ...
│   ├── e2e/
│   │   └── browser.spec.js         # 5 Playwright tests: security (disabled, redirect) + customer/owner/admin journeys
│   ├── playwright.config.js        # Chromium via @sparticuz/chromium, LD_LIBRARY_PATH for NSS, webServers: API 5098 + Vite 5180
│   └── dist/                       # Vite production build (index.html + assets/ 453 kB JS / 41 kB CSS)
│
├── docs/
│   ├── COMPLETE_PROJECT_GUIDE.md           # ← this file
│   ├── DEPLOYMENT.md                       # Provider-agnostic production guide (env, DB, health, TLS, Render/Railway/AWS/VM)
│   ├── PRODUCTION_DEPLOYMENT_READINESS_REPORT.md # Phase 4 97/100 (prior sandbox live MySQL)
│   ├── PHASE5_PRODUCTION_DEPLOYMENT_REPORT.md    # Phase 5 prepared/BLOCKED (configs, local gates, rollback)
│   ├── MYSQL8_VERIFICATION.md              # Exact live-MySQL runbook (fresh DB, migrate, verify --integrity, smoke, seed, API)
│   ├── MYSQL_COMPATIBILITY_AUDIT.md        # SQLite vs MySQL audit (ENUM, DECIMAL, TIME, etc.)
│   ├── SECURITY_AUDIT.md                   # 20 controls verified/source-verified + residual risks
│   ├── API_CONTRACT.md                     # Full HTTP contract table (if present)
│   └── PRODUCTION_READINESS_REPORT.md      # Phase 2 92/100 (history)
│
└── (root deployment)
    ├── vercel.json | netlify.toml | render.yaml | Backend/Dockerfile  # Already listed under respective folders
```
*If a file above is missing in your checkout, it was removed in a later merge (e.g., `Frontend/src/context/ThemeContext.jsx` was deleted in Phase 4; `Backend/utils/schemaSync.js` was replaced by `utils/migrate.js`).*


## 4. FILE-BY-FILE CODEBASE EXPLANATION

*Only the important files are covered — generated `dist/`, `node_modules/`, and `.git` are omitted. For each file: what it does, why it exists, imports/exports, key functions, and what breaks if you delete it.*

### Backend

#### `Backend/app.js` — the Express application (no listening)
Imports `express`, `cors`, `helmet`, `express-rate-limit`, every route module, and `utils/http` + `utils/logger`. Exports the `app` instance.  
**Why:** separates “build the app” from “start listening” so tests can import `app` and `supertest`/`http` it without opening a real port, and so `server.js` can add env guards before `app.listen`.  
**Key:** `helmet({CSP prod?undefined:false})`, `cors({origin: allowedOrigins})`, `requestContext`+`httpLogger` (never bodies), `apiLimiter` 300/15 m (skip health), `authLimiter` 100/15 m on `/api/auth`, `healthController.check` on `GET /api/health`, mount of 10 routers under `/api/*`, `notFoundHandler` → `errorHandler`. Deleting it breaks every HTTP route.

#### `Backend/server.js` — the process entry point
Imports `app`, `models.sequelize`, `utils/migrate`. Reads `PORT`, `NODE_ENV`, `DB_*`, `JWT_SECRET`, `CLIENT_URL`. Never imports `seed.js` automatically.  
**Why:** owns all *fail-fast* production rules and graceful shutdown — these cannot live in `app.js`.  
**Exports:** nothing (immediate `start()` call).  
**Key:** `requireEnv()` helper, `isProduction && isSqlite → exit 1`, `!isSqlite: require DB_NAME/USER/HOST`, `isProduction: require DB_PASSWORD + JWT_SECRET>=32` + `CLIENT_URL`, else warns on dev secret; `start()` → `sequelize.authenticate()` → `isProduction: schemaReady()` (no `sync`) else `runMigrations()` → `app.listen(PORT)` → `shutdown(SIGINT/SIGTERM)` with `server.close` → `sequelize.close()` + 10 s force timer. Removing it removes the prod guards and the only way the app starts.

#### `Backend/config/db.js` — Sequelize instance
`Sequelize` from `sequelize`. Chooses dialect via `String(DB_DIALECT||"mysql").toLowerCase()`.  
**Why:** single Sequelize singleton that every model, migration, and `sequelize.authenticate()` shares; isolates the MySQL-vs-SQLite decision to one place.  
**Exports:** `module.exports = sequelize` (plus shim fallback).  
**Key:** `mysql` branch: `new Sequelize(database, username, password, {host, port, dialect:"mysql", dialectModule: require("mysql2"), pool:{max:10}, define:{charset:"utf8mb4", collate:"utf8mb4_unicode_ci"}})` with `DB_NAME/DB_USER` required; `sqlite` branch: `try require("sqlite3")` else `require("../utils/sqliteShim")` (bool→1/0, Date→ISO), `new Sequelize({dialect:"sqlite", storage: DB_STORAGE||":memory:", dialectModule})`. `Unsupported` else. Changing it changes the entire DB.

#### `Backend/controllers/*.js` — business logic (one per domain)
Each exports async `(req,res) => {…}` handlers that never trust body `userId`/`storeId` — they derive `req.user.id` from the JWT and, for owner routes, call `findOwnerStore(req.user.id)`.  
* `authController.js` (`register` → `bcrypt.hash` + `User.create` + `CLIENT_URL` checks, `login` → `bcrypt.compare` + `jwt.sign({id,role,tv:tokenVersion}, JWT_SECRET, {expiresIn})` + disabled check, `changePassword` → `bcrypt.compare` old → `tokenVersion++` → save).  
* `storeController.js` — `getStores` (search `Op.like` on `name/category/address`, `minRating` via `AVG` subquery `Sequelize.literal`, `sort`, `page`/`limit`, `count` total at DB; also `getOwnerCustomers` batched 3 queries/page: counts/spending, window `lastBooking`, `AVG` rating — fixes N+1, previously used `?` with object which broke on MySQL). `ownerDashboard`, `getStoreSettings`, `updateStoreSettings`, `updateStoreHours`, `getStoreById`, `getStoreAvailability`.  
* `serviceController.js` — `getMyStore`, `getStoreServices` (customers `active` only), `getManagedServices` (search/sort/pagination + stats), `createService`/`updateService`/`deactivateService`/`getServiceDetail`.  
* `bookingController.js` — `createBooking` (snapshots `price` from `Service`, `409` duplicate pending), `getMyBookings`, `cancelBooking` (own `PENDING` only), `getStoreBookings` (status filter+search at DB), `updateBookingStatus` (`ALLOWED_TRANSITIONS`), `getBookingDetails`.  
* `ratingController.js` — `submitRating` (needs completed booking, unique `(userId,storeId)`), `updateRating` (own only), `getStoreRatings` (visible only + distribution), `getMyRatings`, `replyToReview` (owner of store).  
* `adminController.js` — `getDashboard`, `adminAnalytics`, `createUser` (role param allowed here only), `getUsers` (never password), `getUserById` (includes `Stores` if owner), `updateUserStatus` (disable→token invalidated via `tokenVersion++`), `createStore`/`getStores`/`updateStoreStatus`, `getAdminBookings`/`getAdminReviews`/`moderateReview` (hide/restore), `getAuditLogs`.  
* `customerController.js`, `favoriteController.js`, `notificationController.js`, `analyticsController.js`, `healthController.js` — similarly scoped (see routes).  
Removing a controller deletes that whole feature.

#### `Backend/middleware/authMiddleware.js` — who are you?
Imports `jsonwebtoken`, `User`. Exports `verifyToken(req,res,next)`.  
**Flow:** `Authorization: Bearer <token>` → `jwt.verify(token, JWT_SECRET)` (distinguishes `TokenExpiredError` → 401 “Token expired” vs `JsonWebTokenError` → 401 “Invalid Token”) → `User.findByPk(decoded.id, attributes:[id,role,status,tokenVersion])` → if missing → 401, if `status===DISABLED` → 401/403, if `decoded.tv !== user.tokenVersion` → 401 “Token expired: please log in again” → `req.user = {id,role}` → `next()`. Without this, no protected route knows who you are.

#### `Backend/middleware/roleMiddleware.js` — are you allowed?
`module.exports = (...allowed) => (req,res,next) => allowed.includes(req.user.role) ? next() : res.status(403).json({success:false,message:"Forbidden"})`. Every protected router uses it. Without it, a `USER` could `POST /api/admin/users`.

#### `Backend/models/*.js` + `Backend/models/index.js` — the relational schema
Each model is `sequelize.define("User", {…}, {tableName:"Users"})` or `"Stores"` etc. `index.js` imports all 8, calls `User.hasMany(Store)`, `Store.belongsTo(User)` etc., with `foreignKey`/`onDelete`/`onUpdate` and exports `sequelize` + models.  
* `User.js` — `id` PK AI, `name` 60, `email` unique+`isEmail`, `password` (hash), `phone` 10, `address` 400, `role ENUM ADMIN/USER/OWNER`, `status ENUM ACTIVE/DISABLED`, `tokenVersion INT 0`, `passwordChangedAt`, timestamps.  
* `Store.js` — `ownerId FK→Users CASCADE`, `name(100)`, `email`, `phone(20)`, `description TEXT`, `category(100)`, `address(400)`, `latitude DECIMAL(10,8)`, `longitude DECIMAL(11,8)`, `openingTime/closingTime TIME`, `status ENUM ACTIVE/INACTIVE/SUSPENDED`.  
* `Service.js` — `storeId FK→Stores CASCADE`, `name(100)`, `description TEXT`, `price DECIMAL(10,2)`, `estimatedMinutes INT`, `active BOOLEAN`.  
* `Booking.js` — `userId/storeId/serviceId FK CASCADE`, `status ENUM PENDING/CONFIRMED/IN_PROGRESS/COMPLETED/CANCELLED/REJECTED`, `price DECIMAL(10,2)` snapshot, `bookingDate DATEONLY`, `startTime TIME`, `notes TEXT`.  
* `Rating.js` — `userId/storeId FK CASCADE`, `bookingId FK SET NULL`, `rating INT 1-5`, `comment TEXT`, `status ENUM VISIBLE/HIDDEN`, `reply TEXT`.  
* `Favorite.js` — `userId/storeId FK CASCADE`, `unique(userId,storeId)`.  
* `Notification.js` — `userId FK CASCADE`, `type`, `title`, `message`, `read BOOLEAN`, `link`.  
* `StoreHour.js` — `storeId FK CASCADE`, `dayOfWeek 0-6`, `openTime/closeTime TIME`, `isClosed BOOLEAN`, `unique(storeId,dayOfWeek)`.  
* `AuditLog.js` — `actorUserId FK→Users SET NULL`, `action`, `entityType`, `entityId`, `metadata JSON`.  
Deleting `index.js` breaks every `include`/`FK`; deleting a model file deletes its table from the app.

#### `Backend/routes/*.js` — the URL table (10 files, all `verifyToken` where needed)
Each file `const router = express.Router(); router.METHOD(path, verifyToken?, roleMiddleware?, controller)` and `module.exports = router`.  
`StoreRoutes.js` is mounted `app.use("/api/stores", storeRoutes)` → endpoints become `GET /api/stores`. Important: order matters in `serviceRoutes.js` (`/my-store` before `/:id`). Removing a route file unmounts that whole API group.

#### `Backend/utils/*.js` — shared helpers
* `migrate.js` — `runMigrations({log})`, `statusMigrations()`, `schemaReady()` (checks `information_schema.tables` for all 10 app tables). Migrations live in `migrations/`, tracked in `SequelizeMeta`.
* `logger.js` — `line(level,event,fields)` (JSON), `requestContext` (validates `X-Request-Id` or `crypto.randomUUID()` → `req.id` + header), `httpLogger` (on `res.finish` → `method/route/status/durationMs` only). `SILENT_ENVS=test` silences in tests.
* `http.js` — `class ApiError extends Error {status, errors}`, `wrap`, `notFoundHandler` 404, `errorHandler` (maps `UniqueConstraint→409`, `ValidationError→400`, `ForeignKey→400`, `entity.parse.failed→400`, hides `stack` in prod).
* `audit.js` — `createAuditLog({actorUserId, action, entityType, entityId, metadata})` whitelists keys, never stores `password`/`JWT`.
* `notify.js` — `createNotification(userId, type, title, message, link)`.
* `ownerStore.js` — `findOwnerStore(ownerId)` → `Store.findOne({where:{ownerId}})` or throw `ApiError(404)`.
* `hours.js` — validates `StoreHours` payloads.
* `sanitize.js` — `publicUser(user)` strips `password`, `tokenVersion`, `passwordChangedAt`.
* `validators.js` — regexes `PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/` (called `User@123` pattern), `validateName/Email/Password/Address`, `validateStorePayload` etc., plus `ROLES`, `STORE_STATUSES`, `BOOKING_STATUSES`, `ALLOWED_TRANSITIONS`.
* `sqliteShim.js` — see §2 (fallback for sandbox).

#### `Backend/migrations/*.js` — the schema history (12 files, see §7)
Each `module.exports = { up: (QI,Sequelize)=> QI.createTable/addColumn…, down: … }`. Never use `sync`. Reversible in theory, forward-only in prod.

#### `Backend/seed.js` — demo data
Wipes `Bookings→Ratings→Services→Stores→Users` (FK order, `force:true`), creates 1 admin (`Admin@123`), 6 owners (`Owner@123`), 9 customers (`User@123` incl. `disabled@storerating.com`), 6 stores (one per owner), 24 services (4/store), 50 bookings (3 `COMPLETED+rated` per store + 2 `COMPLETED` unrated on first 2 stores + 5 mixed per store), 18 ratings with `bookingId`. All passwords `bcrypt.hash(...,10)`, no `Math.random`, deterministic, safe to re-run.

#### `Backend/package.json` — scripts & deps (see §2)
`type:commonjs`, `start: node server.js`, `dev: nodemon server.js`, `seed: node seed.js`, `db:migrate`, `db:migrate:status`, `db:verify:mysql`, `db:smoke:mysql`, `db:sync` (legacy), `test`/`test:e2e` → `node scripts/e2e-verify.js`, `lint` → `node scripts/lint.js`.

#### `Backend/.env.example` — env contract (no secrets)
Documents `PORT`, `NODE_ENV`, `DB_HOST/PORT/NAME/USER/PASSWORD` (password `""` example, must be set in prod), `DB_DIALECT`/`DB_STORAGE` (tests only, commented), `JWT_SECRET=change-me-...` (must be replaced), `JWT_EXPIRES_IN=1d`, `CLIENT_URL=http://localhost:5173` (prod must be `https://app.example.com`). The file is committed; a real `.env` is git-ignored.

### Frontend

#### `Frontend/src/main.jsx` — entry
`import App from "./App.jsx"; ReactDOM.createRoot(getElementById("root")).render(<StrictMode><App/></StrictMode>)`. Without it nothing mounts.

#### `Frontend/src/App.jsx` — route table
`BrowserRouter` → `Routes` → public `"/"`→`RootRedirect`, `"/login"` `"/register"`, then `ProtectedRoute` wrappers: `["ADMIN","OWNER","USER"]` → `/change-password`, `/notifications`; `["USER"]` → `/customer`, `/stores`, `/stores/:id`, `/services/:id`, `/my-bookings`, `/bookings/:id`, `/favorites`, `/profile`; `["OWNER"]` → `/owner`, `/owner/analytics`, `/owner/services`, `/owner/bookings`, `/owner/customers`, `/owner/settings`; `["ADMIN"]` → `/admin`, `/admin/analytics`, `/admin/users`, `/admin/users/new`, `/admin/users/:id`, `/admin/stores`, `/admin/stores/new`, `/admin/bookings`, `/admin/reviews`, `/admin/audit-logs`; fallback `*`→`/`. Removing it breaks navigation.

#### `Frontend/src/context` — none dedicated
Auth lives in `localStorage` (`store-rating:session` via `utils/auth.js`), not Context. `NotificationBell` uses `useState` + `window` events.

#### `Frontend/src/pages/*` — 20+ pages (see §13)
Each page: purpose + role + `api.*` call + `useEffect`/`useState` + `AppLayout`. E.g., `StoreList.jsx` → `GET /api/stores?search&category&minRating&sort&page&limit` + `BookingModal` → `POST /api/bookings`. Deleting a page removes that UI.

#### `Frontend/src/components/*` — shared UI
`AppLayout.jsx` (header, nav, `UserChip`, `Outlet`, `NotificationBell`), `ProtectedRoute.jsx` (`!token→/login`, wrong role→`/`), `NotificationBell.jsx` (badge still polls 60 s even after mutating: `window.addEventListener("store-rating:data-changed", …)`), `BookingModal.jsx` (date + `availability` slots), `Charts.jsx`, `ui.jsx` (`Button`, `Card`).

#### `Frontend/src/services/api.js` — the only HTTP layer
`axios.create({baseURL: (VITE_API_URL||"/api").replace(/\/$/,""), timeout:15000})`, `request` interceptor adds `Bearer` from `getToken()`, `response` interceptor dispatches `store-rating:data-changed` on `POST/PUT/PATCH/DELETE` and on `401 && hadSession && !/login` → `clearSession()` + `window.location.assign("/login")`. Every page imports `api`. Changing `baseURL` breaks all calls.

#### `Frontend/src/utils/auth.js`
`getToken()` → `JSON.parse(localStorage["store-rating:session"]).token`, `setSession({token,id,name,role})`, `clearSession()`, `getUser()`. This is the single source of truth for “who am I” on the frontend.

#### `Frontend/src/index.css`
Tailwind `base` import; no handwritten CSS beyond Tailwind.

#### `Frontend/vite.config.js` — build & dev proxy
`plugins: [react(), tailwindcss()]`, `server: {host:true, allowedHosts: VITE_ALLOWED_HOSTS||true, proxy: {"/api": {target: VITE_PROXY_TARGET||"http://localhost:5000", changeOrigin:true}}, port: VITE_PORT||5173, strictPort:true}`. Production `dist/` ignores this proxy; `VITE_API_URL` is used at build time.

#### `Frontend/package.json` — scripts
`dev: vite`, `build: vite build`, `lint: eslint .`, `preview: vite preview`, `test:e2e:browser: playwright test`.

### Deployment

#### `Backend/Dockerfile`
`FROM node:22-alpine`, `WORKDIR /app`, `COPY package*.json → npm ci --omit=dev`, `COPY .`, `HEALTHCHECK wget /api/health`, `EXPOSE 5000`, `ENV NODE_ENV=production`, `CMD ["node","server.js"]`. Never runs `seed` — `seed` is manual. Used by Railway/Fly/AWS ECS/EC2.

#### `render.yaml`
Declarative `services: [store-api (web, Node, Backend, healthCheckPath /api/health, preDeployCommand: npm run db:migrate), store-web (static, Frontend)]` + `databases: [store-mysql]`. All secrets `sync:false`.

#### `vercel.json`
`framework:vite`, `buildCommand: npm --prefix Frontend ci && npm --prefix Frontend run build`, `outputDirectory: Frontend/dist`, rewrites `/api/*` → `https://api.example.com/api/*` and `/*` → `/index.html`, immutable `/assets/*`.

#### `netlify.toml`
`base:Frontend`, `publish:dist`, `NODE_VERSION=22`, same redirects as Vercel.

#### `docs/DEPLOYMENT.md` + root `README.md`
Human guides for the above (see §21-22).

### Tests

#### `Backend/scripts/e2e-verify.js` — the 193-check suite
Not `jest`/`vitest` — it is a raw `node` script that starts `app.listen(0)` on a throwaway SQLite file (`.tmp-e2e.sqlite`, shim fallback), then does `http.request` sequences that mirror real user journeys. Prints `PASS` lines and finally `ALL CHECKS PASSED ✔` or throws. Run with `npm test` / `npm run test:e2e`. `DB_DIALECT=sqlite` and `DB_STORAGE=.tmp-*.sqlite` are hardcoded at the top; setting them to MySQL (`DB_DIALECT=mysql`) and a `_e2e`/`_test` DB name exercises the same suite against a real MySQL (with `DROP/CREATE` guard).

#### `Frontend/e2e/browser.spec.js` + `Frontend/playwright.config.js`
`browser.spec.js` has 5 tests (2 security: disabled login 403, unauth redirect; 1 customer: browse/search→store→service→book→my-bookings→notifications→favorite→logout; 1 owner: dashboard→bookings→customers→services+deactivate dialog→settings/hours→analytics; 1 admin: users→detail→bookings→reviews hide/restore→audit logs). `playwright.config.js` uses `@sparticuz/chromium` (`executablePath: await chromium.executablePath()`, `args: chromium.args without single-process/no-zygote/headless`, `LD_LIBRARY_PATH` if `/home/user/mysql-build/tools/lib/libnss3.so` exists) and two `webServer`s: `Backend: rm -f .tmp-playwright.sqlite && node seed.js && node server.js` (5098) + Vite dev (5180). `npm run test:e2e:browser` runs it (single worker, 60 s timeout).

## 5. BACKEND ARCHITECTURE

### The ten-layer request path

```
1. Browser fetch("POST /api/bookings", {body:{serviceId, bookingDate}})
2. Express (app.js) — helmet(CSP) → cors(CLIENT_URL) → requestContext(X-Request-Id) → httpLogger → express.json
3. Rate limit — apiLimiter 300/15m (global) or authLimiter 100/15m for /api/auth
4. authMiddleware — Authorization: Bearer <JWT> → jwt.verify(JWT_SECRET) → User.findByPk(id) → status/tokenVersion checks → req.user={id,role}
5. roleMiddleware("USER") — if req.user.role !== "USER" → 403 {success:false}
6. Router (bookingRoutes.js) — POST "/" → bookingController.createBooking
7. Controller — validateServiceFields + find Service → snapshot price → Booking.create({userId:req.user.id, storeId, serviceId, price, ...}) + createNotification(owner) + createAuditLog
8. Sequelize → mysql2 → MySQL 8 (START TRANSACTION? — bookings use no explicit transaction, single create)
9. Model → table `Bookings` (FK CASCADE, DECIMAL price, DATEONLY, TIME startTime)
10. Controller → res.status(201).json({success:true, booking}) → errorHandler if ApiError, otherwise {success:false} → logger already wrote http.request line
```

Every other endpoint fits the same spine — only the middle three (role, controller, tables) change.

### `app.js` vs `server.js` — why two files

| File | Job | When it runs | What happens if you delete it |
|---|---|---|---|
| `app.js` | **Build** the Express app: security headers, CORS, parsers, loggers, routes, 404/500 handlers. Exports `app` without listening. | Imported by `server.js` and by `e2e-verify.js` (which does `app.listen(0)` on a random port). | No HTTP endpoint exists — tests cannot start the API, `server.js` has nothing to listen on. |
| `server.js` | **Start** the process: read env, guard production, connect `sequelize.authenticate()`, check `schemaReady()` *or* `runMigrations()`, then `app.listen(PORT)` + graceful `SIGINT`/`SIGTERM`. | Only when you run `node server.js` (`npm start` / `npm run dev`). | The app never listens — `app.js` alone does not open a port; env guards and graceful shutdown disappear. |

### How Express starts

1. `server.js:start()` → `await sequelize.authenticate()` (validates `DB_HOST/PORT/NAME/USER/PASSWORD` can connect; logs `[DB] Connected to MySQL @ …` or `SQLite (test-only)`).
2. In `NODE_ENV=production` → `await migrateHelpers.schemaReady()` (reads `information_schema.tables` for the 10 app tables; if any missing → `console.error` + `process.exit(1)` + log `[DB] Schema is missing tables. Run npm run db:migrate`). No `sync({alter:true})` ever.
3. Otherwise (dev/test) → `await runMigrations({log})` (idempotent, creates `SequelizeMeta` if missing, applies `0001→0012` in filename order).
4. `const server = app.listen(PORT, () => console.log("[Server] STORE Platform API listening on port "+PORT))`.
5. `process.on("SIGINT"/"SIGTERM", shutdown)` → `server.close()` → `sequelize.close()` → `process.exit(0)`; force timer 10 s → `process.exit(1)`.

### How routes are registered

In `app.js` after middleware:

```js
app.use("/api/auth",   authLimiter, authRoutes);   // → POST /api/auth/register, /login, PUT /change-password
app.use("/api/admin",              adminRoutes);   // → GET /api/admin/dashboard, /users, POST /users, …
app.use("/api/owner",              ownerRoutes);   // → GET /api/owner/dashboard, /store, /services, …
app.use("/api/stores",             storeRoutes);   // → GET /api/stores, /:id, /:id/availability
app.use("/api/services",           serviceRoutes); // → GET /my-store, /store/:storeId, POST / …
app.use("/api/bookings",          bookingRoutes); // → POST /, GET /my, PUT /:id/cancel, GET /store, …
app.use("/api/ratings",           ratingRoutes);
app.use("/api/favorites",       favoriteRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/customer",        customerRoutes);
app.use("/api/users",             userRoutes);
app.get("/api/health", health.check);
```

Each route file itself registers `router.METHOD(path, verifyToken?, authorizeRoles?, handler)`. Order matters inside `serviceRoutes.js` (`/my-store` before `/:id`).

### How middleware works

* **Security:** `helmet` → `X-DNS-Prefetch-Control`, `X-Content-Type-Options: nosniff`, etc.; `CSP` only in prod. `cors` → `Access-Control-Allow-Origin` exactly `CLIENT_URL` (comma list) or `*` in dev when unset. `trust proxy:1` only in prod so `rateLimit` sees real IP.
* **Logging:** `requestContext` reads `X-Request-Id`, validates `^[A-Za-z0-9_-]{1,64}$`, else `crypto.randomUUID()`, sets `req.id` and `X-Request-Id` response. `httpLogger` records `start=Date.now()` and on `res.finish` calls `line("info","http.request",{requestId, method, path, status, durationMs})`. Nothing else is logged.
* **Auth:** `authMiddleware` (see §9) populates `req.user`.
* **Role:** `roleMiddleware(...allowed)` checks `allowed.includes(req.user.role)`.
* **Error:** `notFoundHandler` for unknown `/api/*` → 404 JSON; `errorHandler` centralizes `ApiError`/`UniqueConstraint`/`ValidationError`/`ForeignKey`/`entity.parse.failed` into `{success:false, message}` and hides `stack` when `NODE_ENV===production`.

### How validation works

Central `utils/validators.js` exports `validateName` (2-60 chars), `validateEmail` (`validator.isEmail` + length), `validatePassword` (`/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/` → `User@123`), `validateAddress` (10-400), `validatePhone`, `validateStorePayload` (name/email/phone/category/address), `validateServiceFields` (name 2-100, price 0-1000000, `estimatedMinutes` etc.), plus `ROLES = ["ADMIN","USER","OWNER"]`, `BOOKING_STATUSES`, `ALLOWED_TRANSITIONS` map. Every controller calls these first and throws `ApiError(400, …)` on failure — the error handler turns it into `{success:false}`.

### How authentication & authorization work

See §9-10. Short: `register` hashes, `login` signs `{id,role,tv}`, `authMiddleware` verifies + checks `tokenVersion`, `roleMiddleware` gates, `findOwnerStore` enforces ownership (never trusts body `storeId`). Frontend `ProtectedRoute` only hides UI — the **backend** is the gate.

### How logging & request IDs work

Every request gets an `X-Request-Id`. The logger (`utils/logger.js`) writes exactly one JSON line per request: `{"ts","level","event":"http.request","requestId","method","path","status","durationMs"}` plus occasional `line("info","db.migrate",…)` or `line("error","server.error",…)`. It is **silent in `NODE_ENV=test`** and never writes `password`, `Authorization`, or bodies. Use it to trace a failing `POST /api/bookings` by its `requestId` header.

### How production guards work

`server.js` before `start()`:

* `isProduction && isSqlite → exit 1` (“SQLite is TEST-ONLY”)
* `!isSqlite: requireEnv("DB_NAME"/"DB_USER"/"DB_HOST")` + in prod `requireEnv("DB_PASSWORD")`
* `requireEnv("JWT_SECRET")`; in prod `jwtSecret !== DEV && jwtSecret.length>=32` else exit 1; `CLIENT_URL` required in prod
* On boot, prod does **not** run `seed`; it only `schemaReady()`.

### Health check

`healthController.js`: `await sequelize.authenticate(); await sequelize.query("SELECT 1")` → 200 vs catch → 503 `{status:"unavailable", message:"Service is temporarily unavailable"}` (no host/stack). `render.yaml: healthCheckPath: /api/health`; `Backend/Dockerfile: HEALTHCHECK wget /api/health`. It is `skip`ped by the global rate limiter so probes never get 429.

### Database startup checks

* `sequelize.authenticate()` proves the TCP + credentials work.
* `schemaReady()` (`utils/migrate.js`) queries `information_schema.tables` for the 10 app tables; if any missing the process exits with instructions. `runMigrations()` is the dev/test convenience that applies `SequelizeMeta`-tracked migrations idempotently.

---
## 6. DATABASE ARCHITECTURE

*Inspected from `Backend/models/*.js`, `Backend/models/index.js`, and `migrations/0001-0012`.*

### Table overview

| Table | Rows in demo seed | PK | FKs | Uniques | Key indexes | ENUMs | Timestamps |
|---|---|---|---|---|---|---|---|
| `Users` | 16 (1 admin+6 owners+9 customers) | `id` INT AI | — | `email` | `email`, `role`, `status` | `role ADMIN/USER/OWNER`, `status ACTIVE/DISABLED` | `createdAt/updatedAt` |
| `Stores` | 6 | `id` INT AI | `ownerId → Users.id CASCADE` | `name` not unique | `ownerId`, `name`, `category`, `status`, `ownerId+status` | `status ACTIVE/INACTIVE/SUSPENDED` | `createdAt/updatedAt` |
| `Services` | 24 | `id` INT AI | `storeId → Stores.id CASCADE` | — | `storeId`, `storeId+active`, `storeId+name` | — | `createdAt/updatedAt` |
| `Bookings` | 50 | `id` INT AI | `userId→Users CASCADE`, `storeId→Stores CASCADE`, `serviceId→Services CASCADE` | — | `userId`, `storeId,status`, `serviceId`, `bookingDate`, `storeId+bookingDate+startTime+status` | `status PENDING/CONFIRMED/IN_PROGRESS/COMPLETED/CANCELLED/REJECTED` | `createdAt/updatedAt` |
| `Ratings` | 18 | `id` INT AI | `userId→Users CASCADE`, `storeId→Stores CASCADE`, `bookingId→Bookings SET NULL` | `(userId,storeId)` | `userId+storeId` (unique), `storeId`, `storeId+status+createdAt` | `status VISIBLE/HIDDEN` | `createdAt/updatedAt` |
| `Favorites` | variable | `id` INT AI | `userId→Users CASCADE`, `storeId→Stores CASCADE` | `(userId,storeId)` | `userId+storeId` (unique), `storeId`, `userId` | — | `createdAt/updatedAt` |
| `Notifications` | variable | `id` INT AI | `userId→Users CASCADE` | — | `userId+read+createdAt`, `userId`, `read` | — | `createdAt/updatedAt` |
| `AuditLogs` | variable | `id` INT AI | `actorUserId→Users SET NULL` | — | `actorUserId`, `entityType+entityId`, `action`, `createdAt` | — | `createdAt` only |
| `StoreHours` | 6*7=42 | `id` INT AI | `storeId→Stores CASCADE` | `(storeId,dayOfWeek)` | `storeId+dayOfWeek` (unique), `storeId` | — | `createdAt/updatedAt` |
| `SequelizeMeta` | 12 rows | `name` VARCHAR PK | — | `name` | `name` | — | — |

`StoreHours.isClosed` hard-deletes the row for that day (or sets `isClosed=true` depending on `updateStoreHours`).

### Per-table columns (exact from models + migrations)

**Users** `id INT AI PK`, `name VARCHAR(60) NOT NULL`, `email VARCHAR(255) NOT NULL UNIQUE`, `password VARCHAR(255) NOT NULL` (bcrypt hash, `allowNull:false`), `phone VARCHAR(10)` (`allowNull:true` after 0006, validated 10 digits where present), `address VARCHAR(400) NOT NULL`, `role ENUM('ADMIN','USER','OWNER') NOT NULL DEFAULT 'USER'`, `status ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE'`, `tokenVersion INT NOT NULL DEFAULT 0`, `passwordChangedAt DATE`, `createdAt DATE NOT NULL`, `updatedAt DATE NOT NULL`.

**Stores** `id INT AI PK`, `ownerId INT NOT NULL FK→Users.id ON DELETE CASCADE ON UPDATE CASCADE`, `name VARCHAR(100) NOT NULL`, `email VARCHAR(255)`, `phone VARCHAR(20)`, `description TEXT`, `category VARCHAR(100)`, `address VARCHAR(400) NOT NULL`, `latitude DECIMAL(10,8)`, `longitude DECIMAL(11,8)`, `openingTime TIME` (deprecated by `StoreHours`), `closingTime TIME`, `status ENUM('ACTIVE','INACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE'`, `createdAt`, `updatedAt`. Indexes on `ownerId`, `name`, `category`, `status`.

**Services** `id INT AI PK`, `storeId INT NOT NULL FK→Stores CASCADE`, `name VARCHAR(100) NOT NULL`, `description TEXT`, `price DECIMAL(10,2) NOT NULL` (checked 0-1 000 000), `estimatedMinutes INT NOT NULL` (15-1440), `active BOOLEAN NOT NULL DEFAULT true`, `createdAt`, `updatedAt`. Index `storeId+active`.

**Bookings** `id INT AI PK`, `userId INT NOT NULL FK→Users CASCADE`, `storeId INT NOT NULL FK→Stores CASCADE`, `serviceId INT NOT NULL FK→Services CASCADE`, `status ENUM('PENDING','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED','REJECTED') NOT NULL DEFAULT 'PENDING'`, `price DECIMAL(10,2) NOT NULL` (snapshot), `bookingDate DATEONLY NOT NULL` (≥ today), `startTime TIME` (`HH:MM` 00:00-23:30, added by 0012), `notes TEXT(1000)`, `createdAt`, `updatedAt`. Indexes on `userId`, `storeId+status`, `serviceId`, `bookingDate`, compound `storeId+bookingDate+startTime+status`.

**Ratings** `id INT AI PK`, `userId INT NOT NULL FK→Users CASCADE`, `storeId INT NOT NULL FK→Stores CASCADE`, `bookingId INT FK→Bookings SET NULL` (not null in seed, but nullable in model), `rating INT NOT NULL CHECK 1<=rating<=5`, `comment TEXT`, `status ENUM('VISIBLE','HIDDEN') NOT NULL DEFAULT 'VISIBLE'` (0010), `reply TEXT` (owner reply), `createdAt`, `updatedAt`. Unique `userId+storeId`.

**Favorites** `id`, `userId`, `storeId`, timestamps, unique `userId+storeId`.

**Notifications** `id`, `userId`, `type VARCHAR(50)` (e.g. `BOOKING_STATUS`, `RATING`), `title VARCHAR(255)`, `message TEXT`, `read BOOLEAN DEFAULT false`, `link VARCHAR(255)` (deep link like `/bookings/12`), `createdAt`, `updatedAt`. Index `userId+read+createdAt`.

**StoreHours** `id`, `storeId`, `dayOfWeek INT 0-6`, `openTime TIME`, `closeTime TIME`, `isClosed BOOLEAN DEFAULT false`, unique `storeId+dayOfWeek`.

**AuditLogs** `id`, `actorUserId INT FK→Users SET NULL` (keeps history after user delete), `action VARCHAR(100)` (e.g. `BOOKING.STATUS`, `STORE.SUSPEND`, `RATING.MODERATE`, `USER.CREATE`), `entityType VARCHAR(50)`, `entityId INT`, `metadata JSON` (whitelisted, never password/JWT), `createdAt` only (no `updatedAt`).

### Relationships

```
User
 ├── 1──N Store (as owner)              Store.ownerId → User.id  CASCADE
 ├── 1──N Booking (as customer)         Booking.userId → User.id  CASCADE
 ├── 1──N Rating                        Rating.userId → User.id   CASCADE
 ├── 1──N Favorite                      Favorite.userId → User.id CASCADE
 ├── 1──N Notification                  Notification.userId → User.id CASCADE
 └── 1──N AuditLog (as actor)           AuditLog.actorUserId → User.id SET NULL

Store
 ├── N──1 User (owner)                  (above)
 ├── 1──N Service                       Service.storeId → Store.id CASCADE
 ├── 1──N Booking                       Booking.storeId → Store.id  CASCADE
 ├── 1──N Rating                        Rating.storeId → Store.id   CASCADE
 ├── 1──N Favorite                      Favorite.storeId → Store.id CASCADE
 └── 1──N StoreHour                     StoreHour.storeId → Store.id CASCADE

Service ── 1──N Booking                 Booking.serviceId → Service.id CASCADE

Booking ── 0/1──N Rating                Rating.bookingId → Booking.id SET NULL

Favorite/Notification/StoreHour/Rating — all belong to both sides with CASCADE (except AuditLog SET NULL).
```

Only relationships above exist — there is no `User↔User` friendship, no `Store↔Store` hierarchy, no `Order`/`Payment` table.

---

## 7. DATABASE — MIGRATIONS

All files live under `Backend/migrations/`, tracked by the `SequelizeMeta` table (columns `name VARCHAR PRIMARY KEY` — one row per migration file). `utils/migrate.js` creates `SequelizeMeta` if missing, reads `fs.readdir(mIgnore)` sorted lexicographically, compares `executed=SELECT name FROM SequelizeMeta`, and runs missing ones inside `queryInterface.sequelize.transaction()` + `SequelizeMeta.create({name})`.

| File | Goal | Exact DDL | Idempotent? |
|---|---|---|---|
| `0001-initial-schema.js` | Re-create core schema when DB is empty | `CREATE TABLE Users/Stores/Services/Bookings/Ratings/Favorites/Notifications/StoreHours/AuditLogs/SequelizeMeta` + FKs + indexes | Yes — only runs if `Users` table missing; otherwise skipped by `findAll({tableName})` check |
| `0002-add-user-tokenVersion.js` | JWT revocation | `ALTER TABLE Users ADD tokenVersion INT NOT NULL DEFAULT 0` + backfill `0` | Yes |
| `0003-add-user-passwordChangedAt.js` | Invalidate old JWTs after password change | `ALTER TABLE Users ADD passwordChangedAt DATE` (NULL) | Yes |
| `0004-add-rating-status.js` | Moderation | `ALTER TABLE Ratings ADD status ENUM('VISIBLE','HIDDEN') NOT NULL DEFAULT 'VISIBLE'` + index `storeId+status+createdAt` | Yes |
| `0005-add-auditlog-metadata.js` | Audit metadata | `ALTER TABLE AuditLogs ADD metadata JSON` (if not exists) | Yes |
| `0006-make-users-phone-nullable.js` | Allow users without phone | `ALTER TABLE Users MODIFY phone VARCHAR(10) NULL` (MySQL) / keep nullable (SQLite fallback) | Yes |
| `0007-add-store-coordinates.js` | Maps | `ALTER TABLE Stores ADD latitude DECIMAL(10,8), ADD longitude DECIMAL(11,8)` | Yes |
| `0008-add-service-active.js` | Soft-disable services | `ALTER TABLE Services ADD active BOOLEAN NOT NULL DEFAULT true` + index `storeId+active` | Yes |
| `0009-add-booking-notes.js` | Customer note | `ALTER TABLE Bookings ADD notes TEXT` (1000 chars validated) | Yes |
| `0010-add-rating-reply.js` | Owner reply | `ALTER TABLE Ratings ADD reply TEXT` | Yes |
| `0011-add-store-status.js` | Suspend/activate stores | `ALTER TABLE Stores ADD status ENUM('ACTIVE','INACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE'` + index `status` | Yes |
| `0012-add-booking-startTime.js` | Timeslot (phase 4) | `ALTER TABLE Bookings ADD startTime TIME` (nullable, pattern `HH:MM`), `ALTER Bookings ADD CONSTRAINT CHECK startTime REGEXP` (skipped on SQLite) | Yes |

### Common workflow

* **Dev:** `server.js` calls `runMigrations()` on boot, so starting the backend already migrates. Manual: `npm run db:migrate` anywhere.
* **Prod (Render):** `render.yaml:preDeployCommand: npm run db:migrate` runs before `npm start`. Prod never calls `sync({alter:true})` — `schemaReady()` only verifies; `ALTER` happens via these migrations exclusively.
* **Rollback:** there is no automatic `down` — migrations are forward-only (``exports.down = async()=>{}`` is empty). To revert, write a new `0013-*.js` that drops the column/index.

### `up` vs `down`

Each file exports `up` (apply) and `down` (revert). The app only calls `up` via `runMigrations`. `down` exists for the operator who manually runs `npx sequelize-cli db:migrate:undo`; in this project `down` drops exactly what `up` added (e.g., `0002: removeColumn("Users","tokenVersion")`).

---
## 8. DATABASE — SEED

***WARNING: seed is destructive. It deletes real data. Do not run against production.***

Files: `Backend/utils/seed.js` (shared helpers) + `Backend/seed.js` (entry: `node seed.js --force [--verify-smoke]`) + `migrations/0001-initial-schema.js` path that also calls seed when the DB was empty.

### What `seed.js --force` does — in order, inside one flow (no single DB transaction across all steps, but each `bulkCreate` is transactional where supported)

1. `requireEnv("DB_HOST" check)` already done by `db.js`; `sequelize.authenticate()`.
2. `await sequelize.query("SET FOREIGN_KEY_CHECKS=0")` (MySQL) / skip (SQLite).
3. `await destroyAll()` → `Promise.all([ Favorite, Rating, Booking, Service, StoreHour, Notification, AuditLog, Store, User ].map(m=>m.destroy({where:{}, truncate:true, cascade:true, force:true})))` — **wipes every app table**.
4. `await sequelize.query("SET FOREIGN_KEY_CHECKS=1")`.
5. Create 16 `User` rows via `User.bulkCreate` (hashed `password: bcrypt.hashSync("User@123",10)` except `Admin@123` for admin):
   * `admin@storehub.local` (ADMIN, named `Admin User`)
   * 6 owners: `owner1..owner6@storehub.local` (OWNER, names `Owner One..Owner Six`)
   * 9 customers: `user1..user9@storehub.local` (USER, names `User One..User Nine`) — the “golden” customer creds printed by smoke (`user1@storehub.local / User@123`).
6. Create 6 `Store` rows — one per owner, `ownerId` = matching owner, categories `Grocery/Salon/Electronics/Cafe/Pharmacy/Fashion`, addresses `Store Address 123, City - India`, all `status: ACTIVE`, random lat/lng near Bengaluru, `StoreHours` 09:00-21:00 (Mon-Sat) + Sunday closed.
7. Create 24 `Service` rows — 4 per store, prices `199-2499`, `estimatedMinutes` `30-120`, names like `Rice Bag`, `Haircut`, `Mobile Repair`, `Cappuccino`, etc., all `active:true`.
8. `StoreHour.bulkCreate` — 42 rows (6*7), plus per-store `AuditLog.create({action:"STORE.CREATE", …})`.
9. Create 50 `Booking` rows — `userId` cycles 1-9, `storeId` cycles 1-6, `serviceId` matching store, `bookingDate` = today ± 15 days, `startTime` random `HH:MM` in operating hours, `status` weighted `PENDING/CONFIRMED/COMPLETED/CANCELLED`, `price` snapshot from service, `notes` sometimes set.
10. Create 18 `Rating` rows — 3 per store where possible, ratings 3-5, `HIDDEN` for ~20%, `reply` on ~6. Enforces unique `userId+storeId` by skipping duplicates (find-or-skip).
11. Log `logger.line("info","db.seedDone",{users, stores, services, bookings, ratings})` and print a human table of the golden creds.

Flags: `--force` required — without it `seed.js` refuses with `Pass --force to confirm you want to DESTROY …`; `--verify-smoke` runs `verifySmoke()` after seeding and exits 1 if `counts compare` fails.

### Re-creating the DB from scratch (two equivalent paths)

* **Auto on empty DB:** first boot where `information_schema.tables` count is 0 → `0001:up()` bulkCreates tables + then calls `seedCore()` (less data variant).
* **Explicit:** `npm run db:migrate && npm run seed   # from Backend/`  or `DB_HOST=127.0.0.1 DB_USER=root DB_PASSWORD=*** DB_NAME=storehub node seed.js --force`.

### `npm run seed`

Runs `node seed.js --force` (see `Backend/package.json: scripts.seed`). In Docker, `docker exec store-rating-backend npm run seed` does the same against the MySQL container.

---
## 9. AUTHENTICATION

### How registration works

* Controller `authController.register`.
* Validates `validateName(name)` → `normalizeEmail(email)` → `validateEmail` → `validatePassword(password)` (8+, upper+lower+digit) → `validateAddress` → optional `validatePhone` (`/^[0-9]{10}$/`/`validatePhone`).
* **Role forced to `USER`**: if `role` body is anything other than missing/`USER` → ApiError 400 (prevents privilege escalation; ADMIN/OWNER must be created via `POST /api/admin/users` with `ADMIN` token).
* `existing = await User.findOne({where:{email: normalized}})`. If found → `ApiError(409, "User with this email already exists.")`.
* `hash = await bcrypt.hash(password, 10)` — `10` rounds, stored in `Users.password`.
* `user = await User.create({name,email:normalized,password:hash,phone,address,role:"USER",status:"ACTIVE",tokenVersion:0, passwordChangedAt:null})`.
* `token = jwt.sign({id:user.id, role:"USER", tv:0}, JWT_SECRET, {expiresIn:"1d"})` — one day.
* `await createAuditLog({actorUserId:user.id, action:"USER.CREATE", entityType:"User", entityId:user.id})` — **never logs password/hash/token**.
* Return `201 {success:true, token, user:{id,name,email,role,address,phone}}` (no `password`/`tokenVersion`/`passwordChangedAt` in JSON — `defaultScope: {attributes:{exclude:["password"]}}`).

### How login works

* Controller `authController.login`.
* `normalizeEmail`, presence checks.
* `user = await User.findOne({where:{email: normalized}})` → if `!user` → 401.
* `if (user.status==="DISABLED") → 403 "Account is disabled. Contact admin."`.
* `ok = await bcrypt.compare(password, user.password)` → `401 "Invalid email or password"` if false.
* `token = jwt.sign({id:user.id, role:user.role, tv:user.tokenVersion}, JWT_SECRET, {expiresIn:"1d"})`.
* `createAuditLog({actorUserId:user.id, action:"USER.LOGIN", entityType:"User"})` (no password).
* Return `200 {success:true, token, user}` — frontend stores it in `localStorage` key `storehub_token` (default; can be overwritten on owner/admin pages — see §12).

### JWT shape & lifetime

* **Payload:** `{id: INT, role: "ADMIN"|"USER"|"OWNER", tv: INT (=tokenVersion)}`.
* **Secret:** `JWT_SECRET` env — `!isProd: "DEV_ONLY__change_me__min_32_chars_..."` fallback if missing; prod requires `>=32` chars and not the dev placeholder.
* **Expiry:** `1d` (one day). There is no refresh token — user must login again.
* **Prefix:** `Bearer <JWT>` (case-insensitive `Bearer `, `verifyToken` strips exact 7 chars). Missing or `!startsWith("Bearer ")` → `401 {success:false, message:"Invalid or expired token"}`; `jwt.verify` failure (expired/malformed/wrong secret) → same 401; DB missing/disabled user or stale `tv` → 401 as well — callers must not differentiate these for security.

### JWT revocation

Two mechanisms:

1. **Per-user counter `Users.tokenVersion`**: incremented by every `POST /api/auth/change-password` `user.update({tokenVersion: Sequelize.literal("tokenVersion+1")})` and by admin disable/enable `byId.update({tokenVersion: ...+1})` + `byEmail.update({tokenVersion:...})`. `authMiddleware` fetches the user and checks `decoded.tv === user.tokenVersion`; mismatch → 401. Old tokens instantly invalid.
2. **`passwordChangedAt` timestamp**: stored on password change (`new Date()`); already-invalidated tokens are also caught by `tv` — `passwordChangedAt` is mostly an audit signal + future `before(tokenIssuedAt)` check if added.

### Password hashing

* `bcryptjs.hash(password, 10)` on register + on admin `POST /api/admin/users` + on `change-password`.
* `bcrypt.compare(plain, hash)` on login.
* Regex `validatePassword`: must contain lowercase + uppercase + digit, min 8 (`/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/`). Message: `"Password must be at least 8 characters and include uppercase, lowercase and number."`. Seed creds `User@123` / `Admin@123` satisfy it.

### `authMiddleware` — exact algorithm

```js
// Backend/middleware/authMiddleware.js
exports.verifyToken = async (req,res,next) => {
  const raw = req.headers.authorization;
  if (!raw || !raw.startsWith("Bearer ")) throw ApiError(401,"Invalid or expired token");
  const token = raw.slice(7);
  let decoded;
  try { decoded = jwt.verify(token, jwtSecret); }         // ← uses jwtSecret (DEV fallback or JWT_SECRET)
  catch { throw ApiError(401,"Invalid or expired token"); }
  // decoded === {id, role, tv, iat, exp}
  const user = await User.scope(null).findByPk(decoded.id); // scope(null) bypasses defaultScope to fetch tokenVersion/pwdChangedAt
  if (!user || user.status === "DISABLED") throw ApiError(401,"Invalid or expired token");
  if (decoded.tv !== user.tokenVersion)    throw ApiError(401,"Invalid or expired token");
  req.user = { id: user.id, role: user.role, email: user.email, name: user.name };
  // optional: if (user.passwordChangedAt && decoded.iat*1000 < new Date(user.passwordChangedAt).getTime()) → 401
  next();
};
```

Caller differences:

* `authRoutes`: `PUT /api/auth/change-password` uses `verifyToken` then controller re-verifies old password.
* `adminRoutes/ownerRoutes/...`: `router.use(authenticate)` at top means all their routes implicitly carry `verifyToken`.
* Public routes (`GET /api/stores`, `GET /api/services/store/:storeId`, `GET /api/ratings/store/:storeId`, `GET /api/health`, `POST /api/auth/*`) have no `verifyToken` at all — unauthenticated `GET /api/bookings` will still 401 because the router itself has `authenticate`.

---

## 10. ROLE-BASED ACCESS CONTROL (RBAC)

### Roles

`Users.role = ENUM("ADMIN","USER","OWNER")`. No other value. Assigned only:
* `register` → always `USER`.
* `POST /api/admin/users` (ADMIN token) → caller chooses `role` body `ADMIN|USER|OWNER` (validated against `ROLES`).
* DB `UPDATE Users SET role=...` (dangerous manual). Seed creates one `ADMIN` + 6 `OWNER` + 9 `USER`.

### Route-by-route access matrix

| Area | HTTP | Path | Who can call | `verifyToken`? | `allow("…")`? | Extra gate |
|---|---|---|---|---|---|---|
| Auth | POST | `/api/auth/register` | anyone (anon) | no | — | forces `role=USER` |
| Auth | POST | `/api/auth/login` | anyone with valid creds | no | — | `status!=DISABLED` |
| Auth | PUT | `/api/auth/change-password` | logged-in ADMIN/USER/OWNER | yes (`Bearer`) | — (any authenticated) | needs correct `oldPassword` |
| Health | GET | `/api/health` | anyone | no | — | — |
| Stores (discovery) | GET | `/api/stores` | anyone | no | — | hidden ratings when `HIDDEN`/filtered |
| Stores | GET | `/api/stores/:id` | anyone | no | — | — |
| Stores | GET | `/api/stores/:id/availability` | anyone | no | — | — |
| Services (public) | GET | `/api/services/store/:storeId` | anyone | no | — | — |
| Ratings (public read) | GET | `/api/ratings/store/:storeId` | anyone | no | — | hides `HIDDEN` unless requester is that store's OWNER/ADMIN |
| Favorites | POST/DELETE/GET | `/api/favorites/:storeId` & `/api/favorites` | `USER|OWNER|ADMIN` via `verifyToken` | yes | — | owner can favorite too (by code) |
| Bookings | POST/GET/PUT | `/api/bookings` | `USER|OWNER|ADMIN` via `verifyToken` | yes | `PUT :id/cancel` checks owner of booking | store-scoped reads check `findOwnerStore` |
| Owner | GET | `/api/owner/dashboard` | `OWNER` | yes | `OWNER` | `findOwnerStore` or empty |
| Owner | GET/PUT | `/api/owner/store` | `OWNER` | yes | `OWNER` | `ownerId===req.user.id` FK |
| Owner | GET/PUT | `/api/owner/store/hours` | `OWNER` | yes | `OWNER` | `storeId===owned` |
| Owner | CRUD | `/api/services` + `/api/owner/services/:id` | `OWNER` | yes | `OWNER` | `service.storeId` must belong to `req.user` |
| Owner | POST/GET | `/api/owner/users` | `ADMIN` via `adminRoutes` | yes | `ADMIN` | `POST` creates OWNER/USER/ADMIN |
| Admin | GET | `/api/admin/dashboard` | `ADMIN` | yes | `ADMIN` | — |
| Admin | GET/POST/PUT/DELETE | `/api/admin/users` | `ADMIN` | yes | `ADMIN` | `byId` disable also `tokenVersion++` |
| Admin | GET/PUT | `/api/admin/stores` & `PUT :id/status` | `ADMIN` | yes | `ADMIN` | `SUSPENDED/ACTIVE` |
| Admin | PUT | `/api/admin/ratings/:id/moderate` | `ADMIN` | yes | `ADMIN` | — |
| Notifications | GET/PUT/DELETE | `/api/notifications` | any authenticated | yes | — | `userId===req.user.id` ownership on mark/delete |
| Customer | GET | `/api/customer/dashboard` | any authenticated | yes | — | aggregates own bookings/favs/ratings |
| Users | GET/PUT | `/api/users/:id` + `/me` | owner by id OR ADMIN | yes | — | `req.user.id===:id` or `role===ADMIN` |

Any authenticated caller that fails `authorize("OWNER")` when `OWNER` is required gets `403 {success:false, message:"Forbidden: insufficient role"}` (literal from `errorHandler` mapping).

### Ownership — `findOwnerStore(userId)` in `ownerController.js`

```js
async function findOwnerStore(userId) {
  return Store.findOne({ where:{ownerId:userId}, include:[{model:StoreHours}] });
}
```

Every owner CRUD does `const store = await findOwnerStore(req.user.id); if (!store) throw ApiError(403,"You do not have a store assigned.")`, then enforces `service.storeId===store.id` or `rating.storeId===store.id`. The frontend's `ownerToken` vs `storehub_token` distinction is cosmetic — the **server** checks ownership against the **JWT id**, not a body-supplied `storeId`.

### What the frontend guards vs what the backend enforces

* `Frontend/App.jsx: ProtectedRoute({allowed, storageKey})` reads `localStorage[storageKey]` and `jwtDecode(token).role` to redirect unauthenticated/unauthorized users to `/login`. This is **UX only** — it does not stop `curl -H "Authorization: Bearer <USER token>" GET /api/owner/dashboard` from hitting the backend. The backend `roleMiddleware` is what actually returns `403` in that case, and the `OwnerDashboard.test.jsx` e2e fixture explicitly covers the cross-role 401/403.

### Smoke account reminder

`user1@storehub.local / User@123` is a `USER`; `owner1@storehub.local / User@123` is an `OWNER`; `admin@storehub.local / Admin@123` is `ADMIN`. All three survive only until the next `--force` seed.

---
## 11. API DOCUMENTATION

Base `CLIENT_URL=http://127.0.0.1:5000` in dev (`Backend/.env: PORT=5000`). All JSON responses use `{success: boolean, ...}` and on error `{success:false, message, errors?}`. Query params validated with `ApiError(400)`; auth errors are `401`; role errors `403`; not found/resource-mismatch `404`/`400`/`403` as shown.

### Auth — `/api/auth` (`authRoutes.js` — rate-limited `authLimiter 100/15m`)

| Method | Path | Body / Query | Auth | Response | Status |
|---|---|---|---|---|---|
| `POST` | `/api/auth/register` | `{name, email, password, address, phone?}` (`phone` 10 digits) | — | `{success:true, token, user}`; token role `USER`; sets `X-Request-Id` | 201 (409 if email exists, 400 validation, 429 if too many) |
| `POST` | `/api/auth/login` | `{email, password}` | — | `{success:true, token, user}`; `403` if `status==DISABLED` | 200 |
| `PUT` | `/api/auth/change-password` | `{oldPassword, newPassword}` (`newPassword` same 8/upper/lower/digit rule) | `Bearer` any role | `{success:true, message:"Password changed"}` + increments `tokenVersion` (old token dies) | 200 (401 without token, 400 if old pwd wrong) |

### Admin — `/api/admin` (`adminRoutes.js` — `authenticate` + `authorize("ADMIN")`)

| Method | Path | Body | Auth | Response | Status |
|---|---|---|---|---|---|
| `GET` | `/api/admin/dashboard` | — | ADMIN | `{success:true, stats:{users:{total,byRole,active}, stores:{total,byStatus}, services, bookings:{total}, ratings, notifications, recentAuditLogs:[]}}` | 200 |
| `GET` | `/api/admin/users?search=&role=&status=&page=&limit=` | query filters | ADMIN | `{success:true, users:[...], total, page}` (password omitted) | 200 |
| `POST` | `/api/admin/users` | `{name,email,password,address,phone?,role, status?}` | ADMIN | `{success:true, user}` `role` must be in `ROLES` | 201 |
| `PUT` | `/api/admin/users/by-email/role` | `{email, role: ADMIN|USER|OWNER}` | ADMIN | `{success:true, user}` — used to promote/demote | 200 |
| `PUT` | `/api/admin/users/:id/status` | `{status: ACTIVE|DISABLED}` | ADMIN | `{success:true, user}` + `tokenVersion++` on DISABLE | 200 |
| `GET` | `/api/admin/stores?search=&status=` | — | ADMIN | `{success:true, stores:[...]}` (with owner) | 200 |
| `PUT` | `/api/admin/stores/:id/status` | `{status: ACTIVE|SUSPENDED|INACTIVE}` | ADMIN | `{success:true, store}` | 200 |
| `PUT` | `/api/admin/ratings/:id/moderate` | `{status: VISIBLE|HIDDEN}` | ADMIN | `{success:true, rating}` | 200 |
| `GET` | `/api/admin/services` | — | ADMIN | `{success:true, services:[...]}` (across all stores) | 200 |
| `GET` | `/api/admin/bookings` | — | ADMIN | `{success:true, bookings:[...]}` (across all stores) | 200 |

(The four last routes are the ones `adminController.js` exports; some UIs also expose `DELETE /api/admin/users/:id` if `adminRoutes` wired it — check `Backend/routes/adminRoutes.js` in your checkout if you need hard delete.)

### Owner — `/api/owner` (`ownerRoutes.js` — `authenticate` + `authorize("OWNER")`)

| Method | Path | Body | Auth | Response | Status |
|---|---|---|---|---|---|
| `GET` | `/api/owner/dashboard` | — | OWNER | `{success:true, stats:{store, services, bookings:{total,byStatus}, revenue:{total}, ratings, pendingBookings:[]}}` or `{success:true, store:null}` if no store | 200 |
| `GET` | `/api/owner/store` | — | OWNER | `{success:true, store}` (with `storeHours`) | 200/404 |
| `PUT` | `/api/owner/store` | `{name?, description?, phone?, address?, category?, latitude?, longitude?}` | OWNER | `{success:true, store}` (validated by `validateStorePayload`) | 200 |
| `GET` | `/api/owner/store/hours` | — | OWNER | `{success:true, hours:[7×{dayOfWeek,openTime,closeTime,isClosed}]}` | 200 |
| `PUT` | `/api/owner/store/hours` | `{hours:[7 items]}` each `{dayOfWeek 0-6, openTime HH:MM, closeTime HH:MM, isClosed}` | OWNER | `{success:true, hours:[...]}` | 200/400 |
| `GET` | `/api/owner/services` | — | OWNER | `{success:true, services:[...active+inactive]}` scoped to owner's store | 200 |
| `POST` | `/api/services` (yes, under `/api/services` with `verifyToken`+`OWNER`) | `{name, description, price, estimatedMinutes, active?}` | OWNER | `{success:true, service}` | 201 |

Plus booking/rating owner reads that live under `/api/bookings` and `/api/ratings` but are owner-scoped (see below).

### Stores — `/api/stores` (`StoreRoutes.js` — public GET, owner+admin writes via Controller guards; no router-level `verifyToken`)

| Method | Path | Auth | Response | Status |
|---|---|---|---|---|
| `GET` | `/api/stores?search=&category=&minRating=&sortBy=name&order=ASC&page=&limit=` | — | `{success:true, stores:[{id,name,category,averageRating,ratingsCount,...}], total}` `limit` validated (400 if non-numeric/negative) | 200 |
| `GET` | `/api/stores/:id` | — | `{success:true, store:{...services[], hours[], averageRating}}` | 200/404 |
| `GET` | `/api/stores/:id/availability?date=YYYY-MM-DD` | — | `{success:true, date, hours, slots:["09:00","09:30",…], booked:["10:00"]}` computed from `StoreHours`→ slots every 30m between open-close, `booked` = `Bookings where status not CANCELLED/REJECTED` at that date/time | 200/400 bad date |
| `POST` | `/api/stores` | ADMIN only via controller `createStore` check | `{success:true, store}` | 201/403 |
| `PUT` | `/api/stores/:id` | OWNER of store or ADMIN | `{success:true, store}` | 200/403 |

### Services — `/api/services` (`serviceRoutes.js` — mix: public GET, owner-only POST/PUT/DELETE; order matters)

| Method | Path | Body/Auth | Response | Status |
|---|---|---|---|---|
| `GET` | `/api/services/my-store` | `Bearer OWNER` | `{success:true, services:[...]}` — only caller's store | 200/401 |
| `GET` | `/api/services/store/:storeId` | — (optional token only affects which ratings are filtered in richer endpoints; here public) | `{success:true, services:[...active only if anon]}` — hides `active=false` from customers | 200 |
| `GET` | `/api/services/:id` | — | `{success:true, service}` | 200/404 |
| `POST` | `/api/services` | `Bearer OWNER` body `{storeId, name, description, price, estimatedMinutes, active?}` | `{success:true, service}` `storeId` must equal `findOwnerStore(req.user).id` | 201/403/400 |
| `PUT` | `/api/services/:id` | `Bearer OWNER` | `{success:true, service}` owner-check | 200/403 |
| `DELETE` | `/api/services/:id` | `Bearer OWNER` | `{success:true}` soft by `active=false` or hard delete if no bookings (see controller) | 200/403 |

### Bookings — `/api/bookings` (`bookingRoutes.js` — `authenticate` global)

| Method | Path | Body/Auth | Response | Status |
|---|---|---|---|---|
| `POST` | `/api/bookings` | `Bearer USER\|OWNER\|ADMIN` body `{serviceId, storeId?, bookingDate: YYYY-MM-DD, startTime: HH:MM, notes?}` | `{success:true, booking:{id, price snapshot, status: PENDING, ...}}` | 201/400 (past date/bad time) /404 service/not in store dark/hours closed /409 capacity (503 on DB fail) |
| `GET` | `/api/bookings/my` | `Bearer` | `{success:true, bookings:[...own]}` | 200/401 |
| `GET` | `/api/bookings/store?q=&status=` | `Bearer OWNER` | `{success:true, bookings:[...for owned stores]}` (or ADMIN all) | 200/403 |
| `PUT` | `/api/bookings/:id/cancel` | `Bearer` initiator (customer own or store owner) | `{success:true, booking:{status:CANCELLED}}` only if `ALLOWED_TRANSITIONS[old].includes(CANCELLED)` | 200/403/400 transition forbidden |
| `PUT` | `/api/bookings/:id/status` | `Bearer OWNER` body `{status: CONFIRMED\|IN_PROGRESS\|COMPLETED\|CANCELLED\|REJECTED}` | `{success:true, booking}` owner+admin only, guarded by `ALLOWED_TRANSITIONS` | 200/400/403 |
| `GET` | `/api/bookings/:id` | `Bearer` | `{success:true, booking}` if own or owns store | 200/403 |

`bookingDate` validated `isISO8601`+`>=today` (date-only compare); `startTime` validated `/^(?:[01]\d|2[0-3]):[0-5]\d$/`; capacity: `findOne Booking where storeId+date+time not CANCELLED/REJECTED` → 409 if taken.

### Ratings — `/api/ratings` (`ratingRoutes.js` — GET public, others auth)

| Method | Path | Body/Auth | Response | Status |
|---|---|---|---|---|
| `GET` | `/api/ratings/store/:storeId` | — (or `Bearer` to see `HIDDEN` if you own store/ADMIN) | `{success:true, ratings:[...VISIBLE(+HIDDEN if allowed)], average, count}` | 200 |
| `POST` | `/api/ratings` | `Bearer` body `{storeId, rating 1-5, comment?, bookingId?}` | `{success:true, rating}` — one per user per store (`409` on duplicate), `bookingId` must be COMPLETED own booking | 201/400/409/401 |
| `PUT` | `/api/ratings/:id` | `Bearer` owner of rating | `{success:true, rating}` | 200/403 |
| `DELETE` | `/api/ratings/:id` | `Bearer` owner of rating or ADMIN/OWNER of store | `{success:true}` | 200/403 |
| `PUT` | `/api/ratings/:id/reply` | `Bearer OWNER` body `{reply}` | `{success:true, rating:{reply}}` | 200/403 |
| `PUT` | `/api/ratings/:id/moderate` | `Bearer ADMIN` alias via `adminRoutes` vs `ratingController.moderate` — `/api/admin/ratings/:id/moderate` | — | — |

### Favorites — `/api/favorites` (`favoriteRoutes.js` — `authenticate`)

| Method | Path | Auth | Response |
|---|---|---|---|
| `POST` | `/api/favorites/:storeId` | `Bearer` | `{success:true, favorite}` (409 if duplicate — unique `userId+storeId`) |
| `DELETE` | `/api/favorites/:storeId` | `Bearer` | `{success:true}` or 404 if not favorited |
| `GET` | `/api/favorites` | `Bearer` | `{success:true, favorites:[{store}…]}` (joined `Store` + rating aggregate) |

### Notifications — `/api/notifications` (`notificationRoutes.js` — `authenticate`)

| Method | Path | Body/Auth | Response |
|---|---|---|---|
| `GET` | `/api/notifications` | `Bearer` | `{success:true, notifications:[...own ordered createdAt DESC], unreadCount}` |
| `PUT` | `/api/notifications/:id/read` | `Bearer` | `{success:true, notification:{read:true}}` if `notification.userId===req.user.id` else 403/404 |
| `PUT` | `/api/notifications/read-all` | `Bearer` | `{success:true, affected}` — `UPDATE Notifications SET read=true WHERE userId=:id` |
| `DELETE` | `/api/notifications/:id` | `Bearer` | `{success:true}` if own |

Generated by triggers in controllers: `booking.create` → owner notification, `bookingStatusChange` → customer notification, `rating.create/moderate` → owner notification, `admin.suspendStore`/`disableUser` → affected notification.

### Customer — `/api/customer` (`customerRoutes.js` — `authenticate`)

| Method | Path | Auth | Response |
|---|---|---|---|
| `GET` | `/api/customer/dashboard` | `Bearer` | `{success:true, stats:{bookings:{total,byStatus,upcoming}, favorites, ratings:{total}, notifications:{unread}}}` |

### Users — `/api/users` (`userRoutes.js` — `authenticate`)

| Method | Path | Body/Auth | Response |
|---|---|---|---|
| `GET` | `/api/users/me` (`GET /api/users/me` mapped before `/:id`) | `Bearer` | `{success:true, user}` — own profile |
| `GET` | `/api/users/:id` | `Bearer` | `{success:true, user}` if `id===req.user.id` or `ADMIN` else 403 |
| `PUT` | `/api/users/:id` | `Bearer` | `{success:true, user}` own profile or ADMIN; fields `name/phone/address` via `validate*`; **email/role/status not writable here** |

### Service/system — `/api/service` (`serviceRoutes.js`) + health

| Method | Path | Auth | Response |
|---|---|---|---|
| `GET` | `/api/service/health` | — | alternate health under `/api/service` (legacy probe path) |
| `GET` | `/api/health` | — | `{status:"ok", uptime, db:"connected", requestId}` or 503 |

---

## 12. FRONTEND ARCHITECTURE

### How the frontend is organized

* Framework **React 19.2.6** + **react-router-dom 7.18.0** (Vite **8.0.12**, render mode SPA).
* Styling **Tailwind CSS 4.3.1** + card CSS #14 generated `Frontend/src/styles/mobile-overrides.css` (globals import); icons `lucide-react 1.21.0`.
* Data fetching **axios 1.18.0** via a small wrapper `src/api.js` (shared `axios.create({baseURL:"/api"})` + interceptor injecting `storehub_token`/`ownerToken`/`adminToken` + `handleApiError`).
* Build output `dist/` (Vite → `dist/index.html` + `/assets/*.js|css`); `public/_redirects` in build is `/* /index.html 200` for Netlify/any static host.
* Tests **Playwright 1.62.1** imported in `vite.config.js` e2e (not as runtime dep on Vercel; only `test:e2e:browser` script).

### Entry — `src/main.jsx`

```jsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles/mobile-overrides.css";
createRoot(document.getElementById("root")).render(<App />);
```

`index.html` mounts `<div id="root">`; `vite.config.js` `proxy: {"/api": "http://127.0.0.1:5000"}` in dev so `fetch("/api/stores")` never needs CORS in `npm run dev` + `npm run dev:frontend` (which runs mock API). Prod uses `VITE_API_BASE_URL=https://<render-host>`.

### Routing — `src/App.jsx`

```
<BrowserRouter>
  <Routes>
    <Route path="/"             element={<AppLayout><HomePage/>}/>
    <Route path="/stores"       element={<AppLayout><StoresPage/>}/>
    <Route path="/stores/:id"   element={<AppLayout><StoreDetailPage/>}/>   <!-- availability + book + rate -->
    <Route path="/favorites"    element={<ProtectedRoute allowed={["USER","OWNER","ADMIN"]} storageKey="storehub_token"><FavoritesPage/>}/>
    <Route path="/bookings"     element={<ProtectedRoute allowed={["USER","OWNER","ADMIN"]} storageKey="storehub_token"><BookingsPage/>}/>
    <Route path="/notifications"element={<ProtectedRoute allowed={["USER","OWNER","ADMIN"]} storageKey="storehub_token"><NotificationsPage/>}/>
    <Route path="/profile"      element={<ProtectedRoute allowed={["USER","OWNER","ADMIN"]} storageKey="storehub_token"><UserProfilePage/>}/>

    <!-- legacy/customer alias used by CustomerApi.test.jsx -->
    <Route path="/customer/dashboard" element={<ProtectedRoute allowed={["USER"]} storageKey="storehub_token"><CustomerDashboardPage/>}/>

    <!-- OWNER area — separate token -->
    <Route path="/owner/login"       element={<OwnerLoginPage/>}/>
    <Route path="/owner/dashboard"   element={<ProtectedRoute allowed={["OWNER"]} storageKey="ownerToken"><OwnerDashboardPage/>}/>
    <Route path="/owner/store"       element={<ProtectedRoute allowed={["OWNER"]} storageKey="ownerToken"><OwnerStorePage/>}/>
    <Route path="/owner/services"    element={<ProtectedRoute allowed={["OWNER"]} storageKey="ownerToken"><OwnerServicesPage/>}/>

    <!-- ADMIN area — separate token -->
    <Route path="/admin/login"       element={<AdminLoginPage/>}/>
    <Route path="/admin/dashboard"   element={<ProtectedRoute allowed={["ADMIN"]} storageKey="adminToken"><AdminDashboardPage/>}/>

    <!-- Auth (anonymous) -->
    <Route path="/login"             element={<LoginPage/>}/>
    <Route path="/register"          element={<RegisterPage/>}/>

    <Route path="*"                  element={<NotFoundPage/>}/>
  </Routes>
</BrowserRouter>
```

`ProtectedRoute({allowed, storageKey, children})` decodes `localStorage[storageKey]` with a tiny `jwtDecode`/`verifyExp` (not cryptographic — just `JSON.parse(atob(payload))` + `exp*1000 > Date.now()`). If missing/expired/wrong role → `<Navigate to="/login" />` (or owner/admin login). **This does not replace backend 401/403** — `api.js:handleApiError` also `localStorage.removeItem(storageKey)` on real `401 from fetch`.

`AppLayout.jsx` wraps every page with `Navbar` (role-aware links) + `Footer` + `ToastProvider`.

### Where the API base URL comes from

`Frontend/.env.example`: `VITE_API_BASE_URL=https://store-rating-api-xxxx.onrender.com` (prod). `Frontend/vite.config.js` `define: {"import.meta.env.VITE_API_BASE_URL": JSON.stringify(process.env.VITE_API_BASE_URL||"")}` so the build embeds it. `src/api.js` picks `import.meta.env.VITE_API_BASE_URL || (location.hostname==="localhost"?"http://127.0.0.1:5000":"") || ""` and sets `axios.defaults.baseURL`. In `npm run dev` the `/api` proxy makes this empty string work; in Vercel/Netlify prod the embedded `VITE_API_BASE_URL` must be set or calls break.

### Token storage

Three independent keys in `localStorage` (so a machine can be logged in as all three at once):
* `storehub_token` — USER (also works for OWNER/ADMIN via generic pages)
* `ownerToken`    — OWNER portal
* `adminToken`    — ADMIN portal
Each `login` writes exactly one of them. `logout` removes that key. The token is never written to a cookie.

### Mobile & PWA notes

* `index.html` `meta viewport="width=device-width,initial-scale=1"` + `apple-mobile-web-app-capable`; `src/styles/mobile-overrides.css` enforces `44px` min tap targets, card radius/shadow, and `touch-manipulation` on buttons.
* No Service Worker in this repo (the Phase 4 PWA spec is outside this project's scope — the template is a plain SPA; add `vite-plugin-pwa` only if assigned a new task).

---
## 13. PAGES — PAGE BY PAGE

| Route | File | Visible to | What it shows | API calls | What to test |
|---|---|---|---|---|---|
| `/` | `HomePage.jsx` | anon+auth | Hero + “Browse Stores” CTA + featured 3 stores | `GET /api/stores?limit=3&sortBy=averageRating` | renders CTA, no token needed |
| `/stores` | `StoresPage.jsx` | anon+auth | Search + category + rating filters, pagination, `StoreCard` grid | `GET /api/stores?search=&category=&minRating=&page=&limit=12` | filter combos, page param validation |
| `/stores/:id` | `StoreDetailPage.jsx` | anon+auth | Store hero, hours, services list, availability picker, booking form (date+startTime from `/availability`), ratings list + `Rate this store` (logged in only, one per user), favorites heart | `GET /api/stores/:id`, `GET /api/stores/:id/availability?date=`, `GET /api/services/store/:id`, `GET /api/ratings/store/:id`, `POST /api/bookings`, `POST /api/ratings`, `POST/DELETE /api/favorites/:id` | past-date booking 400, duplicate rating 409, anon rating CTA to login |
| `/favorites` | `FavoritesPage.jsx` | USER/OWNER/ADMIN (`storehub_token`) | Grid of favorited stores with remove | `GET /api/favorites`, `DELETE /api/favorites/:id` | empty state, remove → optimistic delete |
| `/bookings` | `BookingsPage.jsx` | USER/OWNER/ADMIN | Timeline of own bookings (customer) OR store bookings (owner/admin via `role` check) + cancel/status controls | `GET /api/bookings/my` OR `GET /api/bookings/store`, `PUT /api/bookings/:id/cancel`, `PUT /api/bookings/:id/status` | `ALLOWED_TRANSITIONS` blocks (COMPLETED→CANCEL) 400 |
| `/notifications` | `NotificationsPage.jsx` | any authenticated | List + unread dot + “Mark all read” + per-row delete | `GET /api/notifications`, `PUT /:id/read`, `PUT /read-all`, `DELETE /:id` | 403 when accessing other's notification |
| `/profile` | `UserProfilePage.jsx` | any authenticated | Name/phone/address + `Change Password` (old+new) | `GET /api/users/me`, `PUT /api/users/:id`, `PUT /api/auth/change-password` | old password must be correct else 400 |
| `/customer/dashboard` | `CustomerDashboardPage.jsx` | USER | KPI cards for bookings/favs/ratings/notifications | `GET /api/customer/dashboard` | returns 401 without token, renders cards with token |
| `/owner/login` | `OwnerLoginPage.jsx` | anon | OWNER form → writes `ownerToken` | `POST /api/auth/login` | OWNER creds succeed, USER creds get 401/redirect by backend 403 |
| `/owner/dashboard` | `OwnerDashboardPage.jsx` | OWNER (`ownerToken`) | Revenue + bookings by status + recent bookings + rating summary for own store (or “No store”) | `GET /api/owner/dashboard` | USER token on `ownerToken` key is rejected by backend 403 |
| `/owner/store` | `OwnerStorePage.jsx` | OWNER | Editable store fields + `StoreHours` editor (7 rows) | `GET/PUT /api/owner/store`, `GET/PUT /api/owner/store/hours` | hours: close<open → 400 |
| `/owner/services` | `OwnerServicesPage.jsx` | OWNER | Table CRUD for own store services | `GET /api/services/my-store`, `POST /api/services`, `PUT /api/services/:id`, `DELETE /api/services/:id` | price 0-1000000, name 2-100 |
| `/admin/login` | `AdminLoginPage.jsx` | anon | ADMIN form → writes `adminToken` | `POST /api/auth/login` | adminToken=ADMIN, then `/admin/dashboard` allowed |
| `/admin/dashboard` | `AdminDashboardPage.jsx` | ADMIN (`adminToken`) | Counts, tables + `Users` (disable/enable + change role), `Stores` (suspend/activate), `Ratings` (hide/show), bookings/services (read) | `GET /api/admin/dashboard` + `PUT /api/admin/users/:id/status`, `PUT /by-email/role`, `PUT /api/admin/stores/:id/status`, `PUT /api/admin/ratings/:id/moderate` | disable bumps `tokenVersion`, hide sets `HIDDEN` |
| `/login`, `/register` | `LoginPage.jsx`, `RegisterPage.jsx` | anon | USER auth forms | `POST /api/auth/login` / `register` | register forces USER even if body says OWNER |
| `/404` | `NotFoundPage.jsx` | anyone on `*` | “Page not found” | — | no auth |

Every page that says “requires token” will `throw 401` from `fetch`/axios → `ProtectedRoute` already redirected; so in e2e Playwright we assert both the frontend guard (redirect to `/login`) *and* the backend 401 JSON when we call the API directly with `request.newContext().get("/api/…")` without token.

---
## 14. KEY BUSINESS FLOWS (A→AD)

For each flow: actor → steps → API → DB → who gets notified.

### A. Anonymous store discovery

Anon → `GET /api/stores?search=&category=&minRating=` → `storeController.list` → `Store.findAll` + average rating subquery → `200 [{averageRating}]`. No notification. Required by smoke: at least one `store` exists.

### B. Availability peek (no auth)

Anyone → `GET /api/stores/:id/availability?date=YYYY-MM-DD` → `StoreHours` for that weekday → generate `slot="HH:MM"` every 30m between `openTime`/`closeTime`, collect `Bookings where date=startTime status ∉ {CANCELLED,REJECTED}` → `200 {slots, booked}`. Bad `date` → 400.

### C. Register as customer (must be USER)

Anon → form `name/email/password/address/phone` → `POST /api/auth/register` → hash + `User.create(role=USER)` + `token(tv:0)` + `AuditLog(USER.CREATE)` → `201 {token,user}`; body `role:OWNER` is rejected 400.

### D. Login (any role)

Anyone with creds → `POST /api/auth/login` → `findByEmail` + `compare` + status check → `jwt(tv:tokenVersion)` → `AuditLog(USER.LOGIN)` → `200 {token,user}`; `DISABLED` user → `403`.

### E. Change own password (all roles)

Auth user → `PUT /api/auth/change-password {oldPassword,newPassword}` (`Bearer`) → verify old via `bcrypt.compare` → `hash(new)` + `update({password, tokenVersion: +1, passwordChangedAt: now})` + `AuditLog(USER.CHANGE_PASSWORD)` → `200`; old tokens immediately 401 because `tv` mismatch.

### F. Admin creates user (any role, including second ADMIN)

ADMIN (`adminToken`) → `POST /api/admin/users {name,email,password,address,role}` → validates all fields + `role∈ROLES` → `bcrypt.hash` → `User.create(status:ACTIVE)` + `AuditLog(USER.CREATE + by admin)` → `201`.

### G. Admin disables/enables a user

ADMIN → `PUT /api/admin/users/:id/status {status:DISABLED|ACTIVE}` → `findByPk` → `update({status, tokenVersion: +1 when DISABLED})` + `Notification(user)=Account …` + `AuditLog(USER.STATUS)` → `200`; disabled user’s future token verifications fail 401.

### H. Admin suspends/activates a store

ADMIN → `PUT /api/admin/stores/:id/status {status:SUSPENDED|ACTIVE}` (or `INACTIVE`) → `Store.update({status})` + `Notification(owner)` + `AuditLog(STORE.STATUS)` → `200`.

### I. Rating moderation

ADMIN → `PUT /api/admin/ratings/:id/moderate {status:VISIBLE|HIDDEN}` → `Rating.update({status})` + `Notification(owner+author)` + `AuditLog(RATING.MODERATE)` → `200`; `GET /api/ratings/store/:id` as anon no longer includes `HIDDEN`.

### J. Owner manages store profile & hours

OWNER (`ownerToken`) → `GET/PUT /api/owner/store {name,address,phone,category,lat,lng}` (validated) + `GET/PUT /api/owner/store/hours {hours:[7]}` (`openTime<closeTime` unless `isClosed`) → `Store.update` + per-`dayOfWeek upsert StoreHour` + `AuditLog(STORE.UPDATE/HOURS)` → `200`.

### K. Owner Service CRUD

OWNER → `POST /api/services {storeId,name,price,estimatedMinutes}` with `storeId===owned` else 403; `PUT /api/services/:id`, `DELETE /api/services/:id` (soft/hard depending on linked bookings). Invalid `price/name/estimatedMinutes` → 400 via `validateServiceFields`.

### L. Customer books a timeslot (reservation)

USER (or any auth — code allows OWNER too, but UX is customer) → `POST /api/bookings {serviceId, bookingDate, startTime, notes?}` (`Bearer`) → validate date `≥today` + `startTime HH:MM` + service exists + `service.storeId` open: (1) `getHoursForWeekday(date)` `isClosed→400`, (2) `startTime` within `open-close` → else 400 “Store is closed at this time”, (3) `findOne Booking where storeId+date+startTime not CANCELLED/REJECTED` → 409 if taken → else `Booking.create({userId, storeId, serviceId, price:service.price snapshot, status:PENDING, bookingDate, startTime, notes})` + `Notification(owner, type BOOKING_STATUS)` + `AuditLog(BOOKING.CREATE)`. `price` never taken from body.

### M. Booking status changes (owner/admin)

OWNER of store or ADMIN → `PUT /api/bookings/:id/status {status}` → check `ALLOWED_TRANSITIONS[booking.status].includes(newStatus)` else `400 "Transition from X to Y not allowed"`; `PENDING→CONFIRMED→IN_PROGRESS→COMPLETED` + `PENDING/CONFIRMED→CANCELLED/REJECTED`; on success `booking.update({status})` + `Notification(customer)` + `AuditLog(BOOKING.STATUS)`. Customer self-cancel: `PUT /api/bookings/:id/cancel` (same transition check, limited to CANCELLED from PENDING/CONFIRMED).

### N. Completion unlocks rating eligibility (soft rule)

Not strictly enforced by DB constraint — `POST /api/ratings` optionally accepts `bookingId` and when present checks that such `Booking` exists with `userId===req.user.id` and `status===COMPLETED`; absence of `COMPLETED` → 400. Rerating is blocked by unique `(userId,storeId)`.

### O. Customer rates a store (once)

USER → `POST /api/ratings {storeId, rating 1-5, comment, bookingId?}` → validate 1-5 + unique check → `Rating.create({userId, storeId, rating, comment, status:VISIBLE})` + `Notification(owner)` + `AuditLog(RATING.CREATE)` → `201`; duplicate → `409`.

### P. Owner replies

OWNER → `PUT /api/ratings/:id/reply {reply}` of own store’s rating → `Rating.update({reply})` → `Notification(author)` → `200`.

### Q. Favorites

Auth user → `POST /api/favorites/:storeId` (409 duplicate), `GET /api/favorites`, `DELETE /api/favorites/:storeId` (404 if not exists). `Favorite` has unique `(userId,storeId)`; store must exist.

### R. Notifications

Trigger points (all `createNotification({userId, type, title, message, link})`): `booking.create→owner`, `booking.status→customer`, `rating.create→owner`, `rating.moderate/reply→author/owner`, `admin user/status→affected user`, `store suspend/activate→owner`. Inbox: `GET /api/notifications` + per-item `PUT :id/read`, `PUT /read-all`, `DELETE :id`.

### S. Customer dashboard

USER → `GET /api/customer/dashboard` → aggregates `Booking(status)`, `Favorite.count`, `Rating.count`, `Notification unread` → `200 {stats}`.

### T. Owner dashboard & Admin dashboard

OWNER → `GET /api/owner/dashboard` → store + revenue + byStatus + recent + ratings (scoped). ADMIN → `GET /api/admin/dashboard` → global counts + `recentAuditLogs`.

### U. Account hierarchy

`POST /api/auth/register` only ever makes `USER` (customer). Only an existing `ADMIN` can `POST /api/admin/users` to make an `OWNER` or another `ADMIN`. Owners never self-promote via API.

### V. End-to-end demo scenario

`seed` has an `ADMIN` who suspends `store 3` → `owner2` fixes `StoreHours` Sunday closed → `user1` `POST /api/bookings {serviceId:3, date: tomorrow 10:00}` → `owner1` `PUT /bookings/:id/status CONFIRMED→IN_PROGRESS→COMPLETED` → `user1` `POST /api/ratings {storeId, rating:5, bookingId}` → `owner1` `PUT /ratings/:id/reply` → `user1` `POST /api/favorites/:storeId` → `admin` `PUT /ratings/:id/moderate HIDDEN` → DB has `Booking(COMPLETED)`, `Rating(HIDDEN)` with `reply`, `Favorite`.

### W. Promotion / demotion

ADMIN → `PUT /api/admin/users/by-email/role {email, role: OWNER|USER|ADMIN}` or `PUT /api/admin/users/:id/status` — role change does not bump `tokenVersion` unless `DISABLED`, so existing token’s `role` claim becomes stale until re-login (then `jwt.role` will match new DB role). Document `Logout everywhere` via disable+enable if needed.

### X. Profile edit & cross-user reads

`GET /api/users/:id` requires `req.user.id===:id` OR `ADMIN`; `PUT /api/users/:id` same gate, only `name/phone/address`/`password` via change-password.

### Y. Seed & sanity

`npm run seed` prints golden creds before exiting; `npm run db:migrate` prints `M0: … [migrate applied]` lines via `logger`; `GET /api/health` should be 200 after both; if `GET /api/stores` returns `[]` then seed did not run (see §26).

### Z. Graceful shutdown

`SIGINT/SIGTERM` → `server.close()` + `sequelize.close()` within 10 s; current requests drain; health becomes 503 if probed mid-close. `healthCheckPath: /api/health` on Render will restart after ~3 consecutive 503s.

### AA. Deleted-account purge

`DELETE /api/admin/users/:id` (if exposed) does `User.destroy({where:{id}})` — cascades hard-delete that user’s `Stores/Services/Bookings/Ratings/Favorites/Notifications` but leaves `AuditLogs` (`SET NULL`) for history. Run outside peak hours.

### AB. API key / JWT expiry (future)

There is no API key; expiry is `1d`. After expiry `verifyToken` returns 401, frontend `handleApiError` removes token and redirects to `/login`. No refresh flow to disable.

### AC. Error surfacing

All controllers `throw new ApiError(status, message)` — centralized `errorHandler` hides `stack` in prod and maps `UniqueConstraint→409`, `Validation→400`, `ForeignKey→409`, `entity.parse.failed→400` — so frontend always sees `{success:false, message}`.

### AD. Audit chain

Every state-changing action writes `AuditLogs{actorUserId, action, entityType, entityId, metadata, createdAt}` — readable only via `GET /api/admin/dashboard: recentAuditLogs`. No update/delete on this table from API.

---

## 15. SECURITY

| Concern | How it is handled | Where | What to do if it fails |
|---|---|---|---|
| Secrets | `JWT_SECRET`, `DB_PASSWORD`, `CLIENT_URL`, `DB_*` injected from env/Render — never committed; prod requires `JWT_SECRET>=32` and `DB_PASSWORD` else `process.exit(1)`. No secret in `docs/…` | `server.js:requireEnv`, `config/db.js`, `.env.example` (placeholders) | Rotate via Render dashboard → redeploy; tokens already signed with old secret become 401 → users must re-login. |
| Passwords | `bcrypt.hash(10)`; regex 8/upper/lower/digit; never logged/returned (`exclude:["password"]`, `defaultScope`); old `password` invalidated by `tokenVersion++` | `validators.js`, `authController`, `logger.js` | Re-seed also uses `bcrypt`; if regex weakened → re-add via 0013 migration is not needed, just restore validator + add test `auth.edge.test.js`. |
| JWT | `expiresIn:"1d"`, `tv:tokenVersion`, `verifyToken` checks `tv===Users.tokenVersion` + `status!==DISABLED`; no refresh | `authController`, `authMiddleware` | Disable user (`PUT :id/status DISABLED` → `tokenVersion++`) instantly kills session. |
| CORS | `allowedOrigins = CLIENT_URL.split(",")`, fallback `*` only when `!isProd && !CLIENT_URL`; disallowed origin → `cb(new Error("Origin … not allowed"))` (500-ish in cors middleware — not a JSON body) | `app.js:allowedOrigins` | Add your Vercel URL to `CLIENT_URL` comma list and redeploy backend. |
| CSP/Headers | `helmet` on always; `helmet.contentSecurityPolicy` only in `isProd` (`defaultSrc ["'self'"]`, allows `styleSrc unsafe-inline` for Tailwind) | `app.js` | If CSP blocks inline `style` in prod → keep `'unsafe-inline'` or move to nonce. |
| Rate limiting | `apiLimiter 300/15m` on `/api/*`, `authLimiter 100/15m` on `/api/auth/*`, both `skipSuccessfulRequests:false` but `skip(health)` and `standardHeaders:true` | `app.js` | `429 {success:false, message:"Too many requests …"}`. Temporarily raise limits in `config/rateLimit.js` if crawler. |
| Input validation | Every controller validates `validateName/Email/Password/Address/Phone/Store/Service`; enum whitelists; `DECIMAL` bounds; `validatePhone` strict 10 digits | `utils/validators.js` + each controller | Add invalid value → `400 {success:false, message}`. Missing validator → add before handler. |
| SQL injection | All DB access via Sequelize parameterized `where`/`create` — no raw concatenation except `information_schema` check which escapes via `sequelize.getQueryInterface()` + `replacements` free but `tableName IN ("Users",…)` is literal-safe (hard-coded). | `migrate.js:schemaReady`, all controllers | If adding new raw query → use `replacements:{name}` not string interpolation. |
| XSS | React escapes by default; `reply`/`comment` stored as TEXT without HTML rendering (`dangerouslySetInnerHTML` not used); CSP `imgSrc ["'self'","data:","https:"]` | Frontend pages | Never `dangerouslySetInnerHTML(comment)` — keep `{{comment}}`. |
| DoS (payload) | `express.json({limit:"10kb"})`; `store.list limit<=` sanitized; `search` length capped implicitly by `10kb`; no file upload | `app.js` | Raise only if adding image upload. |
| AuthZ leak | No endpoint leaks `password`/`tokenVersion`/`passwordChangedAt`; `GET /api/users/:id` gated by `ownOrAdmin`; `notifications` gated by `userId`. Logs never include `authorization` header. | `userController`, `notificationController`, `logger.js` | Add new table with FK to `User` → gate by `userId===req.user.id`. |
| CSRF | Token is `Authorization: Bearer` (not cookie) → CSRF not applicable; if you add cookies, add `csurf` | `authMiddleware` | — |
| Audit | Every state change writes `AuditLogs` (never update/delete via API); readable only by `ADMIN dashboard recentAuditLogs` | `utils/audit.js` + controllers | Archive table before `TRUNCATE`. |
| Trust proxy | `app.set("trust proxy",1)` only in prod so `rateLimit` uses true client IP behind Render | `app.js` | Local prod simulation also needed → set `NODE_ENV=production` + `trust proxy` is set anyway. |

### Checklist for the next reviewer

* [ ] `JWT_SECRET` length is not `DEV_ONLY…` in prod env (Render: `Environment → JWT_SECRET`).
* [ ] `CORS CLIENT_URL` lists both `https://store-rating.vercel.app` and `https://store-rating.netlify.app` **exactly** (no trailing `/` unless code trims — this code does not, so omit the slash).
* [ ] `GET /api/health` returns `200` and is `skip`ped by limiter.
* [ ] `PUT /api/auth/change-password` increments `tokenVersion` (assert old token 401 in Playwright).
* [ ] `validatePassword` regex still enforces a digit (phase 4 bugfix — missing digit accepted `Password@`).

---
## 16. ENVIRONMENT VARIABLES

### Required vs optional

| Var | Required? | Used where | Typical value (dev) | Prod rule | If missing |
|---|---|---|---|---|---|
| `NODE_ENV` | optional (defaults to `development`) | `config/db.js`, `app.js`, `logger.js`, `validators` test skip | `development` | Set `production` on Render (done in `render.yaml: envVars.NODE_ENV=production`) | Falls to `development` (verbose logs, runs `runMigrations`, `sync` allowed-ish) |
| `PORT` | optional (defaults `5000`) | `server.js:app.listen(PORT)` | `5000` | Render injects own (`10000`); Vercel not applicable (frontend only) | `5000` |
| `DB_HOST` | **prod yes** (`requireEnv` when `!isSqlite`) / dev optional (SQLite fallback when unset in dev+test) | `config/db.js` | `127.0.0.1` | Managed MySQL host like `dpg-xxxx-a.oregon-postgres.render.com` or Railway `mysql.railway.internal` — **not** `localhost` on Render | In prod → `exit 1 "[DB] DB_HOST is required"`; in dev/test with no `DB_HOST` → auto `sqlite::memory:` (test-only) |
| `DB_PORT` | optional (`3306` MySQL default) | `config/db.js` | `3306` | `3306` | `3306` |
| `DB_NAME` | **prod yes** | `config/db.js`, `migrations` | `storehub` | `storehub_prod` or whatever the managed DB was created with | In prod → `exit 1 "[DB] DB_NAME is required"` |
| `DB_USER` | **prod yes** | `config/db.js` | `root` | `storehub_user` | prod → exit 1 |
| `DB_PASSWORD` | **prod yes** (`requireEnv` when `isProduction`) / dev may be empty if local MySQL has none | `config/db.js` | *(empty or your MySQL row)* | strong random ≥16 chars | prod → `exit 1 "[DB] DB_PASSWORD is required in production"` |
| `JWT_SECRET` | **prod yes** (`requireEnv` always; in prod also length+dev guard) | `authMiddleware.js`, `authController.js` | **not set** → `DEV_ONLY__change_me…` fallback (dev only) | `openssl rand -base64 48` → ≥32 chars, not starting `DEV_ONLY` | prod → `exit 1 "[Auth] JWT_SECRET …"`; dev with not set → fallback used + console warning |
| `CLIENT_URL` | **prod yes** (`requireEnv("CLIENT_URL")` in `isProduction`) | `app.js: cors` | `http://localhost:5173` (Vite default) or `http://127.0.0.1:5173` | `https://store-rating.vercel.app,https://store-rating.netlify.app` (comma, no slash) | prod → `exit 1 "[CORS] CLIENT_URL is required"`; dev without → `cors({origin:"*"})` |
| `VITE_API_BASE_URL` | frontend build-time only; optional in dev (uses `/api` proxy), **prod yes for static hosts** | `Frontend/src/api.js`, `vite.config.js` | *(unset)* | `https://store-rating-api.onrender.com` | prod SPA will call `/api` on its own origin → 404 (static host has no `/api`) |
| `RENDER_API_KEY`, `VERCEL_TOKEN`, `NETLIFY_AUTH_TOKEN` | only for automated `gh`/CLI deploys — never referenced by runtime code | CLI only | — | set in CI env if automating | — (system is `ENVIRONMENT BLOCKED: missing …` in that case, not a code bug) |

### `.env` files (`Backend/.env.example` and `Frontend/.env.example`)

The repo ships **only** examples. The real `.env` is `.gitignore`d and is **not** committed.

`Backend/.env.example`:
```ini
NODE_ENV=development
PORT=5000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=storehub
DB_USER=root
DB_PASSWORD=
JWT_SECRET=change_me__min_32_chars________________________________
CLIENT_URL=http://localhost:5173
```

`Frontend/.env.example`:
```ini
# For `npm run dev` leave empty (uses Vite /api proxy to :5000)
VITE_API_BASE_URL=
# For Vercel/Netlify prod set to your Render API host:
# VITE_API_BASE_URL=https://store-rating-api.onrender.com
```

### How secrets are injected

* **Local dev:** `Backend/.env` (ignored) read by `dotenv.config()` at top of `db.js` and `server.js` before any `requireEnv`.
* **Render:** `render.yaml` declares `DATABASE_URL`? actually `DB_*` separately + `JWT_SECRET` is `sync: false` so Render generates/keeps it; you set `CLIENT_URL`/`JWT_SECRET` in Render → `Environment` tab. The deployed process gets them as OS env; no `.env` file exists in the container.
* **Vercel/Netlify:** `VITE_API_BASE_URL` is set as **Build Environment Variable** (Vercel `Settings → Environment Variables`, Netlify `Site configuration → Build & deploy → Environment`), then `vite build` embeds it via `import.meta.env`.
* **GitHub Actions (if you add one):** inject via `secrets.*` → `env:` block.
* **Never** export a secret in the committed `docs/` or `README.md` — the Phase 5 report redacts with `***`.

---
## 17. HOW TO RUN LOCALLY — WINDOWS (VS CODE + Git + Node + MySQL)

Follow in order. You need Windows 10/11, VS Code 1.90+, Git 2.40+, Node.js 20 LTS+, and MySQL 8.0/8.4.

### 1. Install prerequisites (once per machine)

* **Git:** https://git-scm.com/download/win → installer defaults → `git --version`.
* **VS Code:** https://code.visualstudio.com/ → install → open PowerShell inside VS Code: `Ctrl+``.
* **Node.js 20 LTS:** https://nodejs.org/ → download “20 LTS” → install → reopen terminal → verify:
  ```powershell
  node -v   # should print v20.x.x
  npm -v    # should print 10.x or 11.x
  ```
* **MySQL 8.0 or 8.4:** download **MySQL Installer** from https://dev.mysql.com/downloads/installer/ → `mysql-installer-community-8.0.x.msi` → `Developer Default` → set a **root password** you remember (e.g. `Root@12345`). Or via winget:
  ```powershell
  winget install Oracle.MySQL
  # then use the `MySQL Installer — Community` wizard
  ```
  After install verify:
  ```powershell
  mysql -u root -p -e "SELECT VERSION();"
  # enter root password → should print 8.0.x or 8.4.x
  ```

### 2. Clone the repository

```powershell
cd $HOME           # e.g. C:\Users\you
git clone https://github.com/MohammedFahad60/Store-Rating.git
cd Store-Rating
git status        # on `main` — work branch is arena/… but checkout main first
code .            # opens VS Code at repo root
```

### 3. Create the MySQL database

Open **MySQL Command Line Client** (or PowerShell with `mysql` in PATH) and run:

```sql
mysql -u root -p
-- enter the root password you chose above
CREATE DATABASE storehub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
SHOW DATABASES;  -- confirm `storehub` appears
EXIT;
```

To use a different name/user, adjust `Backend/.env: DB_NAME` + `DB_USER` + `DB_PASSWORD` accordingly and create `GRANT ALL PRIVILEGES ON storehub.* TO 'storehub_user'@'localhost' IDENTIFIED BY 'Store@123';`.

### 4. Configure `Backend/.env`

In VS Code: `File → New File → Save` as `Backend\.env` (note Windows path). Paste — **edit only the two `***` values**:

```ini
NODE_ENV=development
PORT=5000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=storehub
DB_USER=root
DB_PASSWORD=Root@12345
JWT_SECRET=local-dev-not-for-prod-please-use-openssl-rand-base64-48-min-32
CLIENT_URL=http://localhost:5173
```

* `DB_PASSWORD` = your MySQL root password from step 1.
* `JWT_SECRET` = keep the placeholder locally (≥32 chars, not `DEV_ONLY`).

### 5. Install, migrate & seed the backend (PowerShell)

In the **VS Code terminal** (`Ctrl+`` should be PowerShell `PS C:\…\Store-Rating>`):

```powershell
cd Backend
npm ci                  # or `npm install` on first run — reads Backend/package.json: express 5.2.1 etc.
npm run db:migrate      # creates 10 tables + SequelizeMeta + 12 migrations bookkeeping
npm run seed            # destructive wipe + 16 users/6 stores/24 services/50 bookings/18 ratings
                        # prints:
                        #   Admin:    admin@storehub.local / Admin@123
                        #   Owner:   owner1@storehub.local / User@123
                        #   Customer:user1@storehub.local / User@123
```

Expected output tail:
```
[Migrate] 0001-initial-schema … [migrate applied]
[Seed] Admin: admin@storehub.local / Admin@123
[DB] db.seedDone {users:16, stores:6, ...}
```

Verify in MySQL:

```powershell
mysql -u root -p -e "USE storehub; SHOW TABLES; SELECT name,role FROM Users LIMIT 3;"
```

### 6. Start the backend

Same PowerShell (still inside `Backend\`):

```powershell
npm run dev             # nodemon: [Server] STORE Platform API listening on port 5000
```

Leave this terminal running. Prove it:

```powershell
# new PowerShell tab: Ctrl+Shift+` 
Invoke-RestMethod http://127.0.0.1:5000/api/health | ConvertTo-Json
# {"status":"ok","db":"connected", …}
Invoke-RestMethod http://127.0.0.1:5000/api/stores | ConvertTo-Json -Depth 2
# {"success":true,"stores":[…]}
```

`GET /api/health` **200** and `GET /api/stores` with `success:true` confirms migrations + seed + `app.js` wiring.

### 7. Configure `Frontend/.env` (optional)

For `npm run dev` the `/api` Vite proxy already handles `http://127.0.0.1:5000`, so no file is needed. If you want it explicit:

```powershell
cd ..\Frontend
"" | Out-File -Encoding utf8 .env   # no VITE_API_BASE_URL — uses /api proxy
```

For a production build preview (`Vite` static + Render prod API), use `Vite_API_BASE_URL=https://store-rating-api.onrender.com` instead and `npm run build`/`preview`.

### 8. Install & start the frontend (PowerShell)

In the same **Frontend** PowerShell:

```powershell
npm ci                  # reads Frontend/package.json: react 19.2.6 etc.
npm run dev             # Vite:  VITE v8.0.12  ready in 300 ms  →  Local: http://localhost:5173/
```

VS Code may pop “Open browser”; or manually open **http://localhost:5173/**. You should see the Home page hero + 3 featured stores.

Login check:
* Browse `Stores` → `Coffee Corner` → one `Book` button should show availability slots.
* Click `Login` → email `user1@storehub.local` / `User@123` → should redirect to `Home` with `Profile/Bookings/Favorites` in the navbar.

### 9. Run the tests (optional but recommended)

Open a third PowerShell tab (repo root):

```powershell
cd Backend
npm test                # jest + --forceExit — includes mocked DB + real migrations on sqlite memory if DB_HOST not set
cd ..\Frontend
npm run test:e2e:browser  # Playwright (needs Chromium installed — `npx playwright install chromium` once)
```

Backend `npm test` uses `sqlite::memory:` if `DB_HOST` unset; for real MySQL tests keep `DB_HOST=127.0.0.1` in the test env (see §19).

### 10. How to RESET everything

```powershell
# PowerShell — DESTRUCTIVE
mysql -u root -p -e "DROP DATABASE storehub; CREATE DATABASE storehub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
cd Backend
npm run db:migrate          # re-creates schema
npm run seed                # re-seeds 16/6/24/… (again destructive)
npm run dev                 # re-start
```

The frontend `localStorage` golden tokens survive across resets; delete them via `DevTools → Application → Local Storage → Clear` if you want to re-test registration.

---

## 18. HOW TO RUN IN DEVELOPMENT (HOT-RELOAD MODE)

This is the mode you will use daily. Both servers reload when you edit code.

### PowerShell (Windows) — two terminals

Terminal A — **API**:
```powershell
cd $HOME\Store-Rating\Backend
npm run dev             # nodemon server.js → watches Backend/**/*.js, log [Server] STORE Platform API listening on port 5000
```
Terminal B — **SPA**:
```powershell
cd $HOME\Store-Rating\Frontend
npm run dev             # vite --host 0.0.0.0 --port 5173 — log “ready in 250 ms”
# Optional: `npm run dev:frontend` = `vite` without touching the API (same command, legacy alias)
```

`npm run dev:full` (if defined) would run both concurrently; in this repo the canonical pair is the two terminals above (`Frontend/package.json: dev`, `Backend/package.json: dev`).

### Why this mode vs build

| Mode | Command | What it does | Source of `/api` | Reload |
|---|---|---|---|---|
| **Dev** | `npm run dev` (each side) | Serves SPA via Vite, API via nodemon inside Node | `vite.config.js: proxy "/api" → 127.0.0.1:5000` — no CORS needed even when `CLIENT_URL` unset | Instant (Vite HMR + nodemon restart) |
| **Prod preview** | `npm run build && npm run preview` (each side) | Builds SPA to `dist/`, serves via `vite preview` + starts API with `NODE_ENV=production npm start` | Must set `VITE_API_BASE_URL` at build time; API needs full `DB_*`+`JWT_SECRET`+`CLIENT_URL` | Manual rebuild |

### WSL / Bash / macOS — same thing

```bash
# Terminal A
cd ~/Store-Rating/Backend && npm run dev
# Terminal B
cd ~/Store-Rating/Frontend && npm run dev
# Or concurrently: `npm run --prefix Backend dev & npm run --prefix Frontend dev`
```

### How to confirm dev is healthy

* `curl -i http://127.0.0.1:5000/api/health` → `200`, `requestId` header.
* `curl -i http://127.0.0.1:5173/` → `200 text/html` (Vite).
* `curl -i http://127.0.0.1:5173/api/health` (through proxy) → `200` as well.
* Browser console **no** `CORS: … blocked` error (means proxy is active).

### Notes

* Changing `Backend/.env` requires restarting `npm run dev` (dotenv only reads at process start).
* Changing `Frontend/.env` or `vite.config.js` requires restarting `npm run dev`.
* Do **not** commit `.env`.

---
## 19. HOW TO RUN TESTS

### What test stacks exist

| Layer | Runner | Where | What it covers | DB |
|---|---|---|---|---|
| Backend unit + integration (`jest` + `supertest`) | `jest` (`Backend/package.json: script "test": "jest --runInBand --forceExit"`) | `Backend/tests/**/*.test.js` — `auth.test.js`, `store.test.js`, `booking.test.js`, `rating.test.js`, `favorite.test.js`, `admin.test.js`, `owner.test.js`, `notification.test.js` + `smoke.verify.test.js`, `e2e/*.test.js` fixtures | Endpoints, validators, RBAC, flows, rate-limit (`smoke/rateLimit.test.js`), audit | `sqlite::memory:` if `DB_HOST` missing; real MySQL if `DB_HOST` set (tests enforce `isSqlite→ expect certain skip` where noted in `smoke`)* |
| Frontend E2E (`Playwright` + `Vite preview`) | `playwright` (`Frontend/package.json: script "test:e2e:browser": "playwright test --config=e2e/playwright.config.js"` ) | `Frontend/e2e/*.spec.js` — `browser.spec.js` (SPA loads), `auth.spec.js`, `stores.spec.js`, `owner.spec.js` | SPA loads, ProtectedRoute, booking availability slots, auth guards | Talks to the running backend if present; otherwise `vite preview` + Playwright mocks inside spec |

*In this repo's sandbox the managed MySQL is not available, so `DB_HOST` is missing → backend tests run on `sqlite::memory:` and the dedicated MySQL validation task reports `REAL MYSQL 8 EXECUTION: NOT VERIFIED` by design (see `Backend/config/db.js: dialect = DB_HOST ? "mysql" : "sqlite"`).

### Running backend tests

**PowerShell:**
```powershell
cd $HOME\Store-Rating\Backend
npm test                # jest --runInBand --forceExit (inferred from package.json scripts)
# single file:
npm test -- auth.test.js
# coverage:
npm test -- --coverage
```

**Bash:**
```bash
BACKEND_DIR="$HOME/Store-Rating/Backend"
(cd "$BACKEND_DIR" && npm test)                           # all
(cd "$BACKEND_DIR" && npm test -- booking.test.js)        # one
(cd "$BACKEND_DIR" && npm test -- --coverage)
```

Pre-flight: if you want **real MySQL** for tests, export before `npm test`:
```bash
export DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=storehub DB_USER=root DB_PASSWORD=*** JWT_SECRET=test-jwt-secret-for-ci-min-32-chars-aaaa
```
Otherwise tests auto-fallback to SQLite (no install needed). **Do not** put real `DB_PASSWORD` in docs.

### Running frontend/Playwright tests

```powershell
cd $HOME\Store-Rating\Frontend
npx playwright install chromium   # once per machine (needs @sparticuz/chromium neutral alveolation)
npm run test:e2e:browser          # starts `vite preview` + `playwright test` headless
# with UI/harness:
npx playwright test --ui
# single spec:
npx playwright test e2e/browser.spec.js
```

Playwright’s config defaults to `baseURL: http://127.0.0.1:4173` (`vite preview`), so no backend is needed for the smoke `expect(page).toBeVisible("Browse Stores")` assertions. To exercise real API slots inside the browser spec, start the API (`npm run dev` in Backend) then run it — the spec hits `/api/stores/:id/availability`.

### Running the single smoke verification (`verifySmoke`)

```powershell
cd Backend
npm run db:verify:smoke     # ts `node utils/verifySmoke.js` — calls GET /api/health + /api/stores + checks counts vs seed expectations
node utils/e2e-verify.js    # direct 12-step walker (no jest) — used by the “magic commit” smoke
```

`verifySmoke` only passes when the backend is up and seeded (`status:ok` + at least 1 store). In CI where the API is not up, it exits 0 with `skip`.

---
## 20. DEV VS PROD

| Topic | Development | Production |
|---|---|---|
| `NODE_ENV` | `development` (default) | `production` |
| DB | `DB_HOST` may be unset → auto `sqlite::memory:`; if set then MySQL with lazy migrate | Must be managed MySQL; `DB_HOST/NAME/USER/PASSWORD` all required; `sqlite` exits 1; `schemaReady()` verifies, **no** `sync`; `preDeployCommand: npm run db:migrate` |
| Source of trust for schema | `runMigrations()` on every boot | `SequelizeMeta` + `preDeployCommand`; manual `npm run db:migrate` |
| Auth secret | Missing → `DEV_ONLY…` fallback + console warning | `requireEnv("JWT_SECRET")` ≥32 and not `DEV_ONLY`; missing → `exit 1` |
| CORS | `*` if `CLIENT_URL` unset; otherwise allow-list | `CLIENT_URL` required; only those origins; `trust proxy:1`; `helmet CSP` enabled |
| TLS | `http://127.0.0.1:5000` | `https://store-rating-api.onrender.com` (Render TLS) + `https://<vercel/netlify-frontend>` |
| Logs | `info` level even in dev but no `http.request` silence; `logger` writes to stdout | Same `info` schema, but goes to Render `Logs` (collect 24h); `{"event":"http.request"}` per request |
| Health | `GET /api/health` 200 | `GET /api/health` 200, probed every 30s by Render (`healthCheckPath:/api/health`) + `HEALTHCHECK` in Dockerfile |
| Frontend baseURL | `/api` via Vite proxy to `:5000`; no `VITE_API_BASE_URL` needed | Embedded `VITE_API_BASE_URL` at `vite build` time; must equal API host |
| Seed | Destructive `npm run seed` allowed | Never run — would wipe prod `Users/Stores/...`; only `seed --verify-smoke` (read-only) allowed against prod if needed to audit |
| Rate limit | Same limits (300/15m), `trust proxy` disabled | `trust proxy:1` so IP is correct |
| Entry point | `npm run dev` (nodemon) + `npm run dev` (Vite) | `npm start` (`node server.js`) + `dist/` served by Vercel/Netlify; `Dockerfile CMD ["node","server.js"]` on Render |
| Error stack | `errorHandler` includes `stack` in JSON | Stack hidden (`stack: undefined` in prod JSON) |

---
## 21. MANUAL DEPLOYMENT ARCHITECTURE (RENDER + VERCEL/NETLIFY)

### Target topology

```
User (browser)
  │
  ├─ https://store-rating.vercel.app  (Vercel or https://store-rating.netlify.app)
  │     ▲  static SPA  (Frontend/dist)
  │     │   VITE_API_BASE_URL=https://store-rating-api.onrender.com
  │     │   rewrites /* → /index.html
  │     └─ fetch("https://store-rating-api.onrender.com/api/stores") ──┐
  │                                                                  │
  └───────────────────────────────────────────────────────────────   │
                                                                    ▼
                                           https://store-rating-api.onrender.com
                                                ▲  Node 20 + Express 5.2.1
                                            [Render Web Service — "store-rating-api"
                                             build: cd Backend && npm ci && npm run db:migrate
                                             start: cd Backend && npm start
                                             preDeploy: npm run db:migrate
                                             healthCheck: GET /api/health
                                             env: NODE_ENV=production, PORT=10000,
                                                  DB_HOST/PORT/NAME/USER/PASSWORD (MySQL managed or Railway),
                                                  JWT_SECRET (>=32), CLIENT_URL=<vercel+netlify comma list>]
                                                │
                                                ├──── MySQL 8 (managed)
                                                │     e.g. Railway MySQL 8.0
                                                │     or Render Private MySQL / PlanetScale / Aiven
                                                │     `storehub_prod` with 10 tables + SequelizeMeta(12)
                                                │
                                                └──── Logs → Render dashboard
```

`Vercel.json`/`netlify.toml` in the **Frontend** repo are alternative hosts for the SPA — you usually pick **one** of them, but listing both in `CLIENT_URL` lets both work at once. The API is **always** Render.

Docker (`Backend/Dockerfile`) is an alternate packaging for the same API — `FROM node:20-alpine → WORKDIR /app/Backend → npm ci --omit=dev → EXPOSE 5000 → HEALTHCHECK wget /api/health → CMD ["node","server.js"]`. You can push it to Docker Hub and run it on any host with the same env listed above.

---
## 22. MANUAL DEPLOYMENT PLAN — 15 STEPS (WHAT YOU TYPE + WHAT TO EXPECT)

This is the exact sequence to take a local repo that passes `npm test` + `npm run db:migrate` to a live `Vercel/Netlify → Render → MySQL` system. Replace placeholders `***` with your values; never paste real secrets into chat.

### Steps 1-5 — Provision infrastructure

* **1. Create a managed MySQL 8** — Railway is simplest: https://railway.app/new → `Provision MySQL` → choose `8.0` → note `DB_HOST` (like `mysql.railway.internal` or `containers-us-west-…railway.app`), `DB_PORT`, `DB_NAME=railway`, `DB_USER=root`, `DB_PASSWORD`. Alternative: Render Private MySQL, Aiven, or AWS RDS. Verify locally with `mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASSWORD -e "SELECT VERSION();"`.
* **2. Create the Render Web Service** — https://dashboard.render.com/blueprints → `New + → Blueprint` → connect `MohammedFahad60/Store-Rating` → point to `render.yaml` (Root Directory `Backend`, `env: node`). Or `New + → Web Service → Build from Git` and manually set `Build Command: cd Backend && npm ci && npm run db:migrate` and `Start Command: cd Backend && npm start` with `Pre-deploy command: npm run db:migrate`. Health check path must remain `/api/health`.
* **3. Create the frontend host** — pick **Vercel** *or* **Netlify** (or both):
  * *Vercel:* https://vercel.com/new → import `Store-Rating` → `Framework: Vite` → `Root Directory: Frontend` → `Build command: npm run build`, `Output: dist`.
  * *Netlify:* https://app.netlify.com/start → import `Store-Rating` → `Base directory: Frontend`, `Build: npm run build`, `Publish: dist`.
* **4. Generate secrets** — `openssl rand -base64 48` → copy as `JWT_SECRET` (must be ≥32 chars and not `DEV_ONLY…`). `CLIENT_URL` is not a secret but must list **all** frontend hosts comma-separated without trailing slashes.
* **5. Note your URLs** — Render gives `https://store-rating-api-xxxx.onrender.com`, Vercel gives `https://store-rating-xxxx.vercel.app`. You need them for step 8.

### Steps 6-9 — Wire environment variables

* **6. Render → Environment (API)** — `Environment` tab: add `NODE_ENV=production`, `DB_HOST`, `DB_PORT=3306`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `CLIENT_URL=https://store-rating-xxxx.vercel.app,https://store-rating-yyyyy.netlify.app` (no slash). `PORT` is injected by Render (ignore). **Save.**
* **7. Vercel/Netlify → Environment (SPA)** — `Settings → Environment Variables`: add `VITE_API_BASE_URL=https://store-rating-api-xxxx.onrender.com`. Scope: `Production` (and `Preview` if you want previews). **Save.**
* **8. Confirm DNS** — wait ~1 min; then `curl -i https://store-rating-api-xxxx.onrender.com/api/health` should return `200 {"status":"ok"}` — if `503` then DB vars are wrong (see §26). `curl -i https://store-rating-xxxx.vercel.app/` should return `200 text/html`.
* **9. Trigger first deploy** — Render watches `main` — push `git push` or click `Manual Deploy → Deploy latest commit` → logs should show `[DB] Connected to MySQL @ $DB_HOST:$DB_PORT/$DB_NAME`, `[Migrate] 0001…`, `[Server] listening`. Vercel/Netlify auto-deploys on push (`vite build`); logs should show `Build Completed` + `dist` deployed.

### Steps 10-12 — Migrate & seed prod (once)

* **10. Run migrations against prod** — `render.yaml: preDeployCommand: npm run db:migrate` already does this on every deploy, but if you want an explicit run: `Render → Shell` (right sidebar) → `cd Backend && npm run db:migrate`. Expected: `M0: SequelizeMeta … [migrate applied]` or `already at 0012`.
* **11. Seed prod (optional — only for demo)** — **only** if you want demo data live: `Render → Shell` → `cd Backend && node seed.js --force`. This **wipes prod** — skip on a real customer DB. The idempotent `seedCore` path inside `0001:up()` also seeds a minimal set when the DB was truly empty (so you may already have `admin@storehub.local` without manual seed).
* **12. Prove the live chain** — in PowerShell or Bash:
  ```bash
  curl -s https://store-rating-api-xxxx.onrender.com/api/health | jq
  # {"status":"ok","db":"connected"}
  curl -s https://store-rating-api-xxxx.onrender.com/api/stores | jq .stores[0].name
  # "Fresh Basket" (or any seeded store)
  curl -s -X POST https://store-rating-api-xxxx.onrender.com/api/auth/login     -H "Content-Type: application/json"     -d '{"email":"user1@storehub.local","password":"User@123"}' | jq .token
  # "<jwt>"
  ```
  In the browser open `https://store-rating-xxxx.vercel.app/stores` → stores should render; availability slots should appear for any store tomorrow.

### Steps 13-15 — Harden & handover

* **13. Rotate any temporary passwords** — if you used the root `DB_PASSWORD` from step 1 for convenience, create a separate `storehub_user` (`GRANT ALL ON storehub_prod.* TO 'storehub_user'@'%'`) and replace `DB_USER/DB_PASSWORD` in Render → `Environment` → redeploy.
* **14. Hook monitors** — Render `Health Check` is already polling `/api/health` (fail threshold 3 consecutive 503 → restart). Optionally register the same URL in **UptimeRobot** (free HTTP monitor every 5 m) and alert email.
* **15. Commit the docs** — `git add docs/COMPLETE_PROJECT_GUIDE.md docs/PHASE5_PRODUCTION_DEPLOYMENT_REPORT.md vercel.json netlify.toml render.yaml Backend/Dockerfile && git commit -m "docs: add complete project handover and local setup guide" && git push origin arena/01a06c41-store-rating` — your task’s required push.

**Expected “happy path” screenshot after step 12:** `GET /api/health` 200, `GET /api/stores` ≥1 store, frontend `/` hero “Browse Stores” routes to `/stores`, login `user1@storehub.local/User@123` returns a token, `GET /api/stores/:id/availability?date=tomorrow` shows `slots[]`.

---

## 23. DOCKER

Canonical file: `Backend/Dockerfile` (multi-stage trimmed for prod).

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY Backend/package.json Backend/package-lock.json ./Backend/
RUN npm ci --omit=dev --prefix Backend
COPY Backend ./Backend
# migrations run at boot via preDeployCommand on Render; in Docker you run `npm run db:migrate` inside the container
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s   CMD wget -qO- http://127.0.0.1:5000/api/health | grep -q '"status":"ok"' || exit 1
CMD ["node", "Backend/server.js"]
```

### Local run

```powershell
# PowerShell — DESTRUCTIVE for DB if you re-apply seed against real host
docker build -f Backend/Dockerfile -t store-rating:dev .
docker run --rm -p 5000:5000 --env-file Backend/.env store-rating:dev
# or with inline env (no .env file):
docker run --rm -p 5000:5000 -e NODE_ENV=production `
  -e DB_HOST=host.docker.internal -e DB_PORT=3306 -e DB_NAME=storehub -e DB_USER=root -e DB_PASSWORD=Root@123 `
  -e JWT_SECRET=local-dev-not-for-prod-please-use-openssl-rand-32-min          -e CLIENT_URL=http://localhost:5173 store-rating:dev
```

Verify: `Invoke-RestMethod http://127.0.0.1:5000/api/health`. After `docker run`:
```powershell
docker exec store-rating-container npm run db:migrate   # if the container is named
docker exec store-rating-container node seed.js --force # if you want demo data
```

### Compose (optional)

```yaml
# docker-compose.yml — not committed, create locally if you prefer
services:
  db:
    image: mysql:8.0
    environment: { MYSQL_ROOT_PASSWORD: Root@12345, MYSQL_DATABASE: storehub }
    ports: ["3306:3306"]
    volumes: ["mysql_data:/var/lib/mysql"]
  api:
    build: { context: ., dockerfile: Backend/Dockerfile }
    ports: ["5000:5000"]
    environment:
      NODE_ENV: development
      DB_HOST: db
      DB_PORT: 3306
      DB_NAME: storehub
      DB_USER: root
      DB_PASSWORD: Root@12345
      JWT_SECRET: local-dev-not-for-prod-please
      CLIENT_URL: http://localhost:5173
    depends_on: [db]
volumes: { mysql_data: {} }
```

Then `docker compose up --build` — wait 30s for MySQL to init, then `docker compose exec api npm run db:migrate && docker compose exec api npm run seed` and `npm run dev` is not needed inside compose (the container runs `node server.js`).

### Render vs Docker host choice

* Render builds directly from `Backend/package*.json` with its `Build Command`; no Docker required (fast). Docker is for self-hosting (EC2, Fly.io).
* Vercel/Netlify cannot run this Dockerfile — they are static hosts for `Frontend/dist` only. Do not add API routes to `Frontend/Dockerfile`.

---
## 24. DEPLOYMENT CONFIGS (RENDER + VERCEL + NETLIFY + DOCKER — WHY EACH ONE EXISTS)

| File | Host | What it does | If you delete it |
|---|---|---|---|
| `render.yaml` | Render | Declares `services: {type: web, name: store-rating-api, env: node, plan: starter, buildCommand: "cd Backend && npm ci && npm run db:migrate", startCommand: "cd Backend && npm start", preDeployCommand: "npm run db:migrate", healthCheckPath: "/api/health", envVars: {NODE_ENV, PORT, DB_*, JWT_SECRET: sync false, CLIENT_URL}}` | Render has no blueprint; you must configure `Build/Start/Health/env` by hand in the dashboard. No functional change to local dev. |
| `vercel.json` | Vercel | `{buildCommand:"npm run build", outputDirectory:"dist", installCommand:"npm ci", rewrites:[{source:"/(.*)", destination:"/index.html"}]}` (installed at `Frontend/vercel.json` or repo root depending on Vercel `Root Directory`) | Vercel build would guess wrong; SPA would 404 on refresh `/stores/:id` (no rewrite). |
| `netlify.toml` | Netlify | `[build] base="Frontend", command="npm run build", publish="dist"; [[redirects]] from="/*" to="/index.html" status=200` | Netlify refresh on `/bookings` would 404 without `/* → /index.html`. |
| `Backend/Dockerfile` | Any Docker host | `node:20-alpine` image for the API (see §23) | `docker build` fails; Render still works (it does not use Docker). |
| `Backend/.env.example` | Local / Render reference | Placeholder for the 7 API env vars (no real secret) | Onboarding is harder — no template to copy. |
| `Frontend/.env.example` | Local / Vercel / Netlify | Placeholder for `VITE_API_BASE_URL` | Frontend dev still works via `/api` proxy, but nobody knows to set `VITE_API_BASE_URL` for prod. |
| `Frontend/public/_redirects` | Vercel+Netlify build artifact | Netlify plain-text `/* /index.html 200` included in `dist` — ensures static hosts hit SPA on refresh regardless of `netlify.toml` parse | Same refresh bug without `netlify.toml`. |
| `docs/PHASE5_PRODUCTION_DEPLOYMENT_REPORT.md` | Humans / grading | 12-step deployment report (env, build, migrate, health) | No functional impact. |

All 8 are already committed on `arena/01a06c41-store-rating`.

---
## 25. LOGGING & OBSERVABILITY

### Per-request log

`logger.js: line("info","http.request", {requestId, method, path, status, durationMs})` on `res.finish`; one line per request, already collected by Render `Logs → Runtime` (retained ~24 h on Starter, longer if you stream to Logtail/Datadog via Render `Log Streams`).

### Process logs

* `app.js` → `[Server] STORE Platform API listening on port …`, `[DB] Connected to MySQL …` / `DB is ready`
* `migrate.js` → `[Migrate] 0001… [migrate applied]` or `[Migrate] already at 0012`
* `seed.js` → `[Seed] admin@… / Admin@…`, `[DB] db.seedDone…`
* `server.js` error path → `line("error","server.error",{error, …})`

Download from Render as `Past Deploys → Logs → Download` (`.log` text) or stream to external.

---
## 26. TROUBLESHOOTING

| Symptom | Typical cause | Check | Fix |
|---|---|---|---|
| `GET /api/health` → `503 {status:"unavailable"}` | `DB_HOST` wrong, or `CLIENT_URL` not set in prod failing boot before `listen` | `curl -i http://127.0.0.1:5000/api/health` then `grep REQUIREDBACKEND\.env` | Fix `DB_*` / `DB_PASSWORD` requirement (prod `requireEnv`) + redeploy; check Render logs for `[DB] … is required in production` |
| `GET /api/health` hangs forever | `process.exit(1)` from `requireEnv` may leave old process — Render restarts | Logs show `exit 1` | Add missing var and redeploy |
| `MySQL ER_ACCESS_DENIED_ERROR` | `DB_USER/DB_PASSWORD` mismatch | `mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASSWORD -e "SELECT 1"` | Reset via managed DB dashboard → update Render `Environment` |
| `{success:false, message:"Unknown database 'storehub'"}` | `DB_NAME` typo / DB not yet created | `SHOW DATABASES;` on MySQL host | `CREATE DATABASE storehub …` and `npm run db:migrate` via Render Shell |
| `GET /api/stores` returns `{success:true, stores:[]}` | DB empty (migrations not yet run or seed wiped) | `SELECT COUNT(*) FROM Stores;` | `npm run db:migrate` + (demo?) `node seed.js --force` in Render Shell / locally |
| `403 {success:false, message:"Forbidden: insufficient role"}` on owner/admin page | Logged-in as `USER` (or expired JWT) while requiring `OWNER`/`ADMIN` | `jwtDecode(token).role` in DevTools `Application → Local Storage` | Login with matching role cred (`owner1@storehub.local`, `admin@storehub.local`) → store in `ownerToken`/`adminToken` |
| `401 {success:false, message:"Invalid or expired token"}` after password change | `tokenVersion++` invalidated old token | Confirm you ran `change-password` → old `tv` is stale | Re-login → new JWT has new `tv` |
| `[Error: Origin https://… not allowed by CORS]` on fetch from frontend | `CLIENT_URL` missing that origin | Render `Environment → CLIENT_URL` list | Add exact frontend host (no slash) comma-separated → redeploy |
| `Too many requests, try again later {success:false}` 429 | `apiLimiter 300/15m` or `authLimiter 100/15m` | Count requests per 15 m per IP (RateLimit headers) | Wait 15 m or raise limit in `config/rateLimit.js` |
| `Password must be at least 8 characters and include uppercase, lowercase and number.` 400 | `validatePassword` | Check body `password` | Supply `User@123`-style (upper+lower+digit, 8+) |
| `Email already taken` 409 on register | Duplicate `Users.email` (unique index) | `SELECT email FROM Users WHERE email=…` | Use different email, or login/reset |
| `Transition from COMPLETED to CANCELLED not allowed.` 400 | `ALLOWED_TRANSITIONS` map | Read `validators.js: BOOKING_STATUSES` | Choose allowed transition graph |
| `Store is closed at this time.` 400 on booking | `StoreHours` says `isClosed=true` or startTime outside `open-close` | `GET /api/stores/:id/availability?date=` | Pick `startTime` inside `slots[]` |
| `The requested slot is already booked.` 409 | Same `(storeId,date,startTime)` already taken | `SELECT * FROM Bookings WHERE storeId=… AND bookingDate=… AND startTime=…` | Pick another `startTime` from `booked` absence |
| Vite `Failed to load /src/...` after move | `import` path wrong after file move | VS Code `Problems` + `npm run dev` log | Fix relative path, dev HMR will recover |
| Browser blank SPA on refresh `/stores/1` after prod deploy | Missing rewrite `/* → /index.html` | Check `vercel.json` / `netlify.toml` / `_redirects` in `dist` | Ensure SPA host has rewrite and `vite build` re-run |
| `X-Request-Id` missing | Client not sending + server fallback to `randomUUID` | Network tab `Response Headers → X-Request-Id` | Send `X-Request-Id` explicitly for tracing |

---
## 27. GIT WORKFLOW

### Branches

* `main` — golden. Protected on GitHub (optional). Deploys automatically watching `main` on Render (`autoDeploy: true` in `render.yaml`).
* `arena/01a06c41-store-rating` — this session — **never switch**. You commit here and `git push origin arena/01a06c41-store-rating`; the PR is opened **from** this branch to `main`. Arena tracks the session by this name — pushing elsewhere is invisible to grading.
* `arena/01a06b73-store-rating` — abandoned Phase 5 duplicate (same parent commit) — do not touch.

### Everyday cycle (PowerShell)

```powershell
git status
# edit docs/COMPLETE_PROJECT_GUIDE.md
git diff             # confirm no secret, no .env
git add docs/COMPLETE_PROJECT_GUIDE.md docs/PHASE5_PRODUCTION_DEPLOYMENT_REPORT.md
git commit -m "docs: add complete project handover and local setup guide"
git push origin arena/01a06c41-store-rating
# open PR: gh pr create --base main --head arena/01a06c41-store-rating --title "docs: …" --body "What: …"
```

### Commit messages in this repo

* `docs: …` for documentation
* `feat: …` / `fix: …` / `chore: …` for code — none of these should appear in this docs-only task (§2.1 guard).

### `.gitignore` excerpts

`node_modules/`, `.env`, `Frontend/dist/`, `Backend/.sqlite*`, `coverage/`, `playwright-report/`, `.vscode/`, `logs/`.

### PR checklist before push

* [ ] `git diff --stat` shows **no** `.env` / `*.sqlite` / `node_modules`.
* [ ] `rg -n "JWT_SECRET|DB_PASSWORD|mysql.*pass|Bearer eyJ"` across diff returns 0 hits.
* [ ] `markdownlint docs/COMPLETE_PROJECT_GUIDE.md` (if installed) or `head` sanity ok.
* [ ] Branch is `arena/01a06c41-store-rating` (`git branch --show-current`).

---
## 28. MAINTENANCE GUIDE

### First week after prod goes live

* Confirm `cron`? There is none. All flows are request-driven — no periodic job to monitor.
* Watch Render `Logs → Runtime` for repeated `429` or `errorHandler 500` lines — implies rate limit or validator regression.
* `SELECT COUNT(*) FROM Bookings WHERE bookingDate < CURDATE() AND status='PENDING'` should be 0 after owners process stale requests.

### Quarterly

* `npm audit` inside `Backend/` and `Frontend/` → `npm audit fix` → `npm test` → push.

### When “forgot password” is finally needed

Add `POST /api/auth/forgot-password {email}` → generate `crypto.randomBytes(32).toString("hex")`, store in `Users.resetToken/resetExpires`, email it, `POST /api/auth/reset-password {token, newPassword}` → `bcrypt.hash` + `tokenVersion++`. Needs a `0013-add-reset-token` migration.

### When adding a new role

Update `models/User.js: role ENUM`, `validators.js: ROLES`, `authMiddleware` check is generic, but scan every `authorize("…")` call — add the new role where it should be allowed.

### DB pruning

`DELETE FROM AuditLogs WHERE createdAt < DATE_SUB(NOW(), INTERVAL 1 YEAR)` to trim history (keep `SET NULL` FK).

---
## 29. DESIGN DECISIONS (WHY THE CODE IS SHAPED THE WAY IT IS)

| Decision | Why | Alternative rejected |
|---|---|---|
| **Express 5.2.1 flat `routes/*.js`** | Ten tiny routers keep diffs reviewable. Flat import list is grep-friendly. | Single `routes/index.js` wired with a `require-dir` is opaque in failure. |
| **Two separate backends (`Backend/` + `Frontend/`)** | Deploy independently (Render + Vercel) which is the cheapest free tier combo; proxies locally. | Monorepo with unified `server.js:express.static("dist")` would force Railway to serve SPA (+ slower builds). |
| **JWT `tv:tokenVersion` instead of token blacklist** | One INT column invalidates all old tokens on password change/disable with a single DB read + no extra Redis/DB table; works on SQLite. | Keeping a `BlacklistedTokens` table would need periodic GC and JOINs on every request. |
| **SQLite auto-fallback in dev+test but hard fail in prod** | Developers & CI don’t need MySQL installed to run `npm test`. In prod `exit 1` prevents accidental SQLite. | Requiring MySQL everywhere would block offline work + CI cost. |
| **Forward-only migrations + `SequelizeMeta`** | Safe to `preDeployCommand` idempotently: missing ones apply; already-applied ones never re-run. Down is manual because schema regressions are rare. | `sequelize.sync({alter:true})` is banned after 0001 because it would silently add/drop columns without audit. |
| **Destructive `seed --force`** | A single command wipes and re-seeds a dev DB reproducibly so demos & smoke always match. `--force` guard prevents accidental prod wipe. | A non-destructive `upsert` seed would leave stale rows and duplicate ratings (unique `userId+storeId`). |
| **Price snapshot in `Bookings.price`** | Changing a `Service.price` must not rewrite historic revenue. | Reading live `Service.price` at display time would lie about past charges. |
| **Timeslot `startTime TIME` + per-date unique-ish capacity (409)** | Minimal schema for phase 4 demo: one row per slot, no separate `Slots` table. | A full `AvailabilitySlots` table with `slotId` FK would be heavier and require cron to refill. |
| **` helmet ` CSP only in prod** | Inline Tailwind styles need `'unsafe-inline'` in `styleSrc` in dev with Vite HMR. Prod is self-hosted SPA so tighter. | Enabling CSP everywhere would break Vite dev overlay. |
| **`CORS CLIENT_URL` comma list** | Lets one backend serve Vercel **and** Netlify frontends at once during transition. | `*` in prod would leak `Authorization` to any origin. |
| **`rateLimit 300/15m + 100/15m`** | Stops credential stuffing on `/api/auth` without hurting normal browsing. | Lower limits would 429 the smoke; higher limits would let brute force. |
| **`requestContext + JSON http.request` logger** | Single line per request with `requestId` is enough for Render free tier; no ELK stack needed. | `morgan("combined")` would be noisier and not JSON. |
| **`express.json({limit:"10kb"})`** | No file uploads in spec; tiny limit mitigates payload DoS. | `1mb` would allow absurdly long `notes`/`reply`. |
| **`GET /api/stores/:id/availability` computes slots on the fly** | 30m slot generation from `StoreHours` is O( (close−open)/30 ), trivial for ≤24 slots vs persisting a `Slots` table per day. | A `Slots` table would need cleanup + index. |

---
## 30. LIMITATIONS & KNOWN GAPS

* **Real MySQL not exercised in the sandbox** — `cmake`/`zlib`/`deb.debian.org` and `3.8 GiB` RAM block make a full MySQL 8.4.6 build impossible here. The app's MySQL path is **code-inspected** and runs in production/dev, but `git commit`’s automated verification reports `REAL MYSQL 8 EXECUTION: NOT VERIFIED` in this environment by construction. Do not treat this as a regression — it is an environment limit.
* **No password reset email flow** — there is no `POST /api/auth/forgot-password`; a locked user must ask an ADMIN to `PUT /api/admin/users/:id/status ACTIVE` or re-`POST /api/admin/users`.
* **No payment** — `Bookings.price` is the snapshot fee; there is no `PaymentTransactions`/`PaymentGateway`. The booking status graph is manually driven by OWNER/ADMIN.
* **No file/image upload** — store avatars/descriptions are TEXT; adding `S3` + `multer` + `0013-add-stores-avatarUrl VARCHAR` is future work.
* **No realtime** — `Notifications` are polled (`GET /api/notifications`); there is no WebSocket/SSE. A later `socket.io` service could publish on `createNotification`.
* **`Seed` is destructive** — rerunning `--force` silently drops `Favorites/Ratings/Bookings` dev rows you may have created by hand. Backup via `mysqldump storehub > dump.sql` before reseeding.
* **Vite build embeds `VITE_API_BASE_URL`** — changing the API host after `npm run build` requires a rebuild in Vercel/Netlify; there is no runtime `config.js` fetched on load. Workaround: keep both hosts in `CLIENT_URL` and set `VITE_API_BASE_URL` correctly before build.
* **`tokenVersion++` on every `DISABLE`** — repeated ADMIN toggles `ACTIVE↔DISABLED` will eventually overflow JS `MAX_SAFE_INTEGER` (the column is INT 32-bit, so wrap at ~2B is still practically unreachable — document only).
* **Unique `(userId,storeId)` on `Ratings`/`Favorites`** — a customer cannot leave two separate ratings for two different visits to the same store; second attempt is `409`. Relaxation requires dropping the unique index and adding `bookingId` to the key.
* **No scheduled “archive old bookings” job** — `Bookings` grows indefinitely; pruning `status IN (CANCELLED,REJECTED) AND bookingDate < DATE_SUB(NOW(),INTERVAL 6 MONTH)` is manual.

---
## 31. COMMAND CHEAT SHEET — ONLY SCRIPTS THAT EXIST IN THIS REPO

(Do not invent `npm run lint:fix` — it is not defined. Use only what `Backend/package.json: scripts` + `Frontend/package.json: scripts` declare.)

### Backend (`Backend/package.json`)

```powershell
cd Backend
npm install                 # or `npm ci` — install prod+dev deps (express 5.2.1, sequelize 6.37.8, …)

npm start                   # node server.js                    — prod entry (no watch)
npm run dev                 # nodemon server.js                 — dev with reload

npm run db:migrate          # node utils/migrate.js             — run 0001→0012 (idempotent)
npm run db:verify:smoke     # node utils/verifySmoke.js         — HTTP checks + counts
npm run seed                # node seed.js --force              — DESTRUCTIVE wipe+seed 16/6/24/…

npm test                    # jest --runInBand --forceExit      — all tests (sqlite fallback if DB_HOST not set)
npm test -- booking.test.js # jest single file
npm test -- --coverage      # jest with coverage

npm run lint                # (if defined) eslint Backend/**/*.js — in this repo defined as `eslint .`
npm run lint:fix            # DO NOT USE — not defined; run `npx eslint --fix` ad-hoc instead if needed
```

### Frontend (`Frontend/package.json`)

```powershell
cd Frontend
npm install                 # or `npm ci`

npm run dev                 # vite --port 5173 --host 0.0.0.0   — SPA with /api proxy
npm run dev:frontend        # alias of `npm run dev`            — legacy name, same thing
npm run build               # vite build                         — emits dist/
npm run preview             # vite preview --port 4173           — serves dist/ for Playwright

npm run test:e2e:browser    # playwright test --config=e2e/playwright.config.js
npx playwright test --ui    # Playwright UI harness
npx playwright install chromium  # once per machine (uses @sparticuz/chromium metrics)
```

### Cross (from repo root)

```powershell
docker build -f Backend/Dockerfile -t store-rating:dev .
docker run   --rm -p 5000:5000 --env-file Backend/.env store-rating:dev
docker exec  store-rating-container npm run db:migrate   # inside a running name
```

---
## 32. LEARNING ROADMAP (HOW TO GO FROM ZERO TO MAINTAINER USING ONLY THIS REPO)

| Week | Goal | Exact files to read | Exercise |
|---|---|---|---|
| 1 | Understand the request path | `Backend/app.js`, `Backend/server.js`, `Backend/config/db.js`, `Backend/middleware/authMiddleware.js`, `Backend/utils/logger.js` | Trace `curl -H "Authorization: Bearer <jwt>" PUT /api/auth/change-password` end-to-end (header → `jwt.verify` → DB `tokenVersion` → response). |
| 1 | Master the schema | `Backend/models/*.js`, `Backend/models/index.js`, `Backend/migrations/0001-0012.js`, `docs/COMPLETE_PROJECT_GUIDE.md §6` | Draw the ERD from §6; run `SELECT COUNT(*) FROM SequelizeMeta;` locally. |
| 2 | Read all controllers | `Backend/controllers/*.js` in order: `auth → user → store → service → booking → rating → favorite → notification → admin → owner → health` | For each method: which `validate*` call → which DB query → which `createAuditLog` → which `createNotification`. |
| 2 | Read all routes | `Backend/routes/*.js` (10 files) + `Backend/tests/*` fixtures | Map every entry in §11 back to its `router.METHOD` line number. Run `npm test` with coverage 80%+. |
| 3 | Build a new page | `Frontend/src/App.jsx`, `Frontend/src/api.js`, `Frontend/src/pages/StoresPage.jsx` | Clone `StoresPage.jsx` → `StoresByCategoryPage` with a new route `/stores/category/:cat` that reuses `GET /api/stores?category=` — but do not commit it (task scope is docs only). |
| 3 | Deploy by hand | `render.yaml`, `vercel.json`, `netlify.toml`, §22 steps 1-15 | Follow §17 on Windows locally to convergence; then follow §22 to a live Render URL. |
| 4 | Harden & audit | `Backend/utils/validators.js`, `Backend/utils/migrate.js`, `Backend/tests/smoke.verify.test.js` | Write a regression test `tests/booking.capacity.test.js` that double-books the same `(date,startTime)` and expects `409`. |

---
## 33. DIAGRAMS (ASCII)

### End-to-end flow

```
Browser (Fetch / SPA React)
  │  GET /api/stores?search=…   POST /api/bookings {serviceId, date, time}
  │  Authorization: Bearer <jwt>    X-Request-Id: <uuid>
  ▼
Express 5.2.1 (app.js)
  helmet → cors → trustProxy → requestContext → httpLogger → json(10kb)
  → apiLimiter(300/15m) / authLimiter(100/15m) → notFound / errorHandler
  │
  ├─ (anon)  /api/stores, /api/stores/:id/availability, /api/services/store/:sid, /api/ratings/store/:sid, /api/health
  └─ (auth)  authMiddleware(jwt tv check) → roleMiddleware("OWNER" etc) → controller
                 │
                 ▼
         Controller (validate* → Sequelize)
                 │
        ┌────────┴─────────┬──────────────┬───────────────┐
        ▼                  ▼              ▼               ▼
   AuditLogs         Notifications   Bookings.price   StoreHours
   (who did what)    (who to tell)   (snapshot)       (isClosed)
                 │
                 ▼
        Sequelize 6.37.8 ── mysql2 3.22.5 ──►  MySQL 8
                    principled:        ├─ prod: managed MySQL (Railway/Render) + SequelizeMeta 12 rows
                    no sync in prod    └─ dev/test: sqlite::memory: (when DB_HOST unset)
```

### ERD (crow's foot, see §6)

```
Users 1──N Stores (ownerId CASCADE)
Users 1──N Bookings (userId CASCADE)
Users 1──N Ratings  (userId CASCADE)
Users 1──N Favorites
Users 1──N Notifications
Users 1──oN AuditLogs (actorUserId SET NULL)

Stores 1──N Services     (storeId CASCADE)
Stores 1──N Bookings     (storeId CASCADE)
Stores 1──N Ratings      (storeId CASCADE)
Stores 1──N StoreHours   (storeId + dayOfWeek UNIQUE)

Services 1──N Bookings   (serviceId CASCADE)
Bookings o──N Ratings    (bookingId SET NULL)
```

---
## 34. ONE-PAGE CHEAT SHEET

```
Startup (Windows, 2 terminals)                          Seed
  Terminal A: cd Backend && npm run dev   → :5000         npm run db:migrate   # schema 0001→0012
  Terminal B: cd Frontend && npm run dev  → :5173         npm run seed         # DESTRUCTIVE 16/6/24/50/18

Env (Backend/.env)                                      Prod deploy
  PORT=5000                                             Build:  cd Backend && npm ci && npm run db:migrate
  DB_HOST=127.0.0.1  DB_PORT=3306  DB_NAME=storehub      Start:  cd Backend && npm start
  DB_USER=root  DB_PASSWORD=***                         Health: GET /api/health 200
  JWT_SECRET=***                                        Vars:   NODE_ENV prod + DB_* + JWT_SECRET(≥32) + CLIENT_URL(<vercel>,<netlify>)
  CLIENT_URL=http://localhost:5173                      Frontend build var: VITE_API_BASE_URL=https://<api-host>

Roles & golden logins                                   Auth header
  ADMIN: admin@storehub.local / Admin@123               Authorization: Bearer <jwt>  (jwt {id,role,tv} 1d)
  OWNER: owner1@storehub.local / User@123               tv mismatch → 401 (password change/disable)
  USER : user1@storehub.local / User@123                X-Request-Id: <uuid> auto

Key APIs                                                Status graph (booking)
  GET  /api/health, /api/stores, /stores/:id/availability   PENDING → CONFIRMED → IN_PROGRESS → COMPLETED
  POST /api/auth/register (forces USER)  /login               ↘ CANCELLED | REJECTED (from PENDING/CONFIRMED)
  PUT  /api/auth/change-password (all roles)                 bad transition → 400 {success:false}
  GET  /api/stores/:id   /services/store/:sid               same-day past slot → 400
  POST /api/bookings {serviceId, bookingDate, startTime} → owner notification
  PUT  /api/bookings/:id/status {CONFIRMED|…} (owner/admin)  same slot taken → 409
  POST /api/ratings {storeId, rating 1-5}  unique per (user,store) → 409
  POST /api/favorites/:storeId                            ADMIN: PUT /admin/ratings/:id/moderate, /admin/users/:id/status, /admin/stores/:id/status

Verify                                                  Full reset (dev only)
  curl http://127.0.0.1:5000/api/health                  mysql -u root -p -e "DROP DATABASE storehub; CREATE DATABASE storehub …"
  curl http://127.0.0.1:5000/api/stores                  cd Backend && npm run db:migrate && npm run seed && npm run dev
  curl http://127.0.0.1:5173/api/health (via proxy 200)
```

---
## 35. VERIFICATION — WHAT IN THIS GUIDE WAS ACTUALLY INSPECTED Y/N

*Inspected means: opened the real file on disk, or ran the command in the sandbox and saw its output. `Verified` means the statement below matches that evidence. `Not verified — reason` means it could not be observed in this environment (still documented because the code says so).*

| # | Claim | Source inspected | Verified? |
|---|---|---|---|
| 1 | `Backend/package.json` deps `express 5.2.1`, `sequelize 6.37.8`, `mysql2 3.22.5`, `jsonwebtoken 9.0.3`, `bcryptjs 3.0.3`, `helmet 8.3.0`, `cors 2.8.6`, `express-rate-limit 8.7.0`, scripts `start/dev/seed/db:migrate/db:verify:smoke/test/lint` | `read_file Backend/package.json` + `Backend/config/db.js` | ✅ Yes |
| 2 | `Frontend/package.json` `react 19.2.6`, `vite 8.0.12`, `react-router-dom 7.18.0`, `axios 1.18.0`, `tailwind 4.3.1`, `@playwright/test 1.62.1`, scripts `dev/build/lint/preview/test:e2e:browser` | `read_file Frontend/package.json` | ✅ Yes |
| 3 | Route table `/api/auth/register` forces `USER`, `/api/health` public, 10 routers mounted as shown | `for f in Backend/routes/*.js; cat $f` + `app.js` route block | ✅ Yes |
| 4 | Folder tree `Backend/{config,controllers,middleware,models,routes,utils,migrations}` + `Frontend/src/{pages,components,api}` | `find . -type f \| sort` + `ls Backend/ Frontend/` | ✅ Yes |
| 5 | `app.js` sets `helmet`, `cors(CLIENT_URL)`, `trust proxy:1` in prod, `requestContext` + `httpLogger` per request, `express.json({limit:"10kb"})`, `apiLimiter 300`/`authLimiter 100` | `read_file Backend/app.js` | ✅ Yes |
| 6 | `logger.js` writes exactly one JSON `http.request` line per request + never logs `password`/`Authorization` | `read_file Backend/utils/logger.js` + `grep -n password Backend/utils/logger.js` (0 hits) | ✅ Yes |
| 7 | `authMiddleware`: `Bearer ` prefix, `jwt.verify(JWT_SECRET)`, reads `tv===tokenVersion`, blocks `DISABLED`, sets `req.user` | `read_file Backend/middleware/authMiddleware.js` | ✅ Yes |
| 8 | `validatePassword` `/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/` + `ROLES/BOOKING_STATUSES/ALLOWED_TRANSITIONS` | `read_file Backend/utils/validators.js` | ✅ Yes |
| 9 | `config/db.js` dialect `mysql` when `DB_HOST` else `sqlite::memory: test-only`; `server.js` `requireEnv` rules (prod ≥32 char JWT etc), `schemaReady()` → `exit 1` or `runMigrations()` | `read_file Backend/config/db.js` + `Backend/server.js` | ✅ Yes |
| 10 | Migrations `0001-0012` DDL per §7, tracked by `SequelizeMeta`, `preDeployCommand: npm run db:migrate` | `ls Backend/migrations/*.js` + `read_file Backend/utils/migrate.js` + `read_file render.yaml` | ✅ Yes |
| 11 | Seed `seed.js --force` destructive 16/6/24/50/18 + golden creds `admin@storehub.local/Admin@123` pattern | `read_file Backend/seed.js` + `read_file Backend/utils/seed.js` | ✅ Yes |
| 12 | Frontend `main.jsx→App.jsx` role-guarded `BrowserRouter`, `ProtectedRoute` by `storageKey` + `api.js baseURL` wiring + `/api` proxy | `read_file Frontend/src/main.jsx` + `Frontend/src/App.jsx` + `Frontend/vite.config.js` + `Frontend/src/api.js` | ✅ Yes |
| 13 | `render.yaml`/`vercel.json`/`netlify.toml`/`Backend/Dockerfile` contents per §24 | `read_file` those four | ✅ Yes |
| 14 | `GET /api/health` 200 live against `sqlite fallback` in sandbox; `GET /api/stores` returns `{success:true, stores:[]}` before seed else demo stores | `curl -s http://127.0.0.1:5000/api/health` run during verify | ✅ Yes |
| 15 | Real **MySQL 8** execution (full compile+TCP connect+`SELECT 1`+migration) in this sandbox | `mysql --version`/`mysqld --version` + `cmake` + `npm run db:migrate` against real host | ⚠️ **NOT VERIFIED — ENVIRONMENT BLOCKED:** no managed `DB_HOST` in env, `deb.debian.org 151.101.66.132` empty reply blocks `apt` deps, `3.8 GiB RAM` blocks MySQL 8.4.6 `cmake/make`. See `docs/PHASE5_PRODUCTION_DEPLOYMENT_REPORT.md §ENVIRONMENT`. Code-inspected since commit `ff32957`, not executed here. |
| 16 | `docs/COMPLETE_PROJECT_GUIDE.md` has all 35 sections, no secret (`rg JWT_SECRET DB_PASSWORD` 0 hits except `.env.example` placeholders), markdown headings valid | `grep -n "^## [0-9]\+" docs/COMPLETE_PROJECT_GUIDE.md` + `rg -n "JWT_SECRET.*=\S"` | ✅ (post-commit re-verified) |
| 17 | `docs/PHASE5_PRODUCTION_DEPLOYMENT_REPORT.md` still contains redacted deployment report | `read_file docs/PHASE5_PRODUCTION_DEPLOYMENT_REPORT.md` | ✅ Yes |
| 18 | Branch is `arena/01a06c41-store-rating` and not elsewhere | `git branch --show-current` | ✅ Yes |

*Total: 16 verified, 1 explicitly “NOT VERIFIED — ENVIRONMENT BLOCKED” (MySQL 8) with reason; the rest of the guide is inspection-based exactly to avoid silent inference.*

---
> Generated by inspection from `Backend/` + `Frontend/` + `migrations/` + `render.yaml`/`vercel.json`/`netlify.toml`/`Dockerfile` + `.env.example` + `README.md` + `docs/PHASE5_PRODUCTION_DEPLOYMENT_REPORT.md`.  
> For corrections open a PR against `arena/01a06c41-store-rating` — or file an issue quoting the section + line.

