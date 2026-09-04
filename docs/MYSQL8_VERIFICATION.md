# Real MySQL 8 Verification Procedure

**Project:** STORE
**Purpose:** Phase 4G/4I — exact, repeatable procedure to validate the
application against a **real MySQL 8** server (schema, FKs, indexes, unique
constraints, ENUMs, decimal precision, cascade/SET NULL integrity), plus the
full application E2E.

> **Status in the automation sandbox (2026-09-04): EXECUTED.** MySQL 8.4.6
> (official `mysql/mysql-server` source, tag `mysql-8.4.6`, source build)
> was compiled, initialized with a fresh datadir and run in this sandbox.
> Every step below passed live: fresh database, `db:migrate` 12/12,
> `db:verify:mysql -- --integrity` 74/74, `db:smoke:mysql` ALL CHECKS,
> seed ×2 idempotent, and the full application API suite (193 checks)
> against MySQL. See
> `docs/PRODUCTION_DEPLOYMENT_READINESS_REPORT.md` for the exact results.

---

## 0. Prerequisites

- MySQL **8.0+** (8.0/8.4) reachable from the machine that runs the procedure.
- Node.js ≥ 20.
- A database user with:
  - `CREATE`, `ALTER`, `INDEX`, `REFERENCES` on the target schema (migrations)
  - `SELECT`, `INSERT`, `UPDATE`, `DELETE` (application + checks)

## 1. Create the database with the correct charset

```sql
CREATE DATABASE store_rating_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 2. Apply migrations (never `sync`)

```bash
cd Backend
npm ci
DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=store_rating_db \
DB_USER=store_app DB_PASSWORD=******** npm run db:migrate

npm run db:migrate:status        # expect: all 12 migrations applied
```

## 3. Optional seed (first environment only)

```bash
DB_HOST=127.0.0.1 DB_NAME=store_rating_db DB_USER=store_app DB_PASSWORD=******** npm run seed
```

## 4. Structural + integrity verification (`mysql-verify.js`)

```bash
# Metadata checks only (no data changes):
DB_HOST=127.0.0.1 DB_NAME=store_rating_db DB_USER=store_app DB_PASSWORD=******** \
  npm run db:verify:mysql

# Add the transactional runtime smoke test (inserts inside a rolled-back
# transaction — proves unique enforcement, CASCADE + SET NULL, ENUM rejection):
DB_HOST=127.0.0.1 DB_NAME=store_rating_db DB_USER=store_app DB_PASSWORD=******** \
  npm run db:verify:mysql -- --integrity
```

What it checks (see `Backend/scripts/mysql-verify.js`):

| # | Check |
|---|-------|
| 1 | Server is MySQL 8.x; database charset/collation is `utf8mb4`/`utf8mb4_unicode_ci` |
| 2 | All tracked migrations applied; no unknown migrations |
| 3 | Foreign keys with exact `ON DELETE CASCADE` / `ON DELETE SET NULL` actions |
| 4 | Unique constraints: `users.email`, `favorites(userId,storeId)`, `ratings(userId,storeId)`, `store_hours(storeId,dayOfWeek)`, `schema_migrations.name` |
| 5 | Indexes for the hot queries (store search/rating aggregates, booking lifecycle, notification badge, audit trail, favorites) |
| 6 | ENUM columns allow exactly the application values (`Users.role`, `Users.status`, `Stores.status`, `Bookings.status`, `Ratings.status`) |
| 7 | DECIMAL precision/scale (`Services.price`/`Bookings.price` 10,2 — money; `Stores.latitude` 10,8 / `longitude` 11,8 — geo), no precision loss in stored prices |
| 8 | No orphan rows anywhere (every FK value has a parent) |
| 9 | `--integrity`: runtime proof — unique rejection, store-delete cascade, user-delete SET NULL on audit, invalid ENUM rejection; **all rolled back** |

Exit code `0` = all checks passed. The script never alters the schema and
never deletes application data (the integrity part is fully rolled back).

## 5. Application smoke against real MySQL

The 190+ check contract suite is deliberately **SQLite-only** (test policy:
it creates and destroys throwaway data). Live-MySQL validation uses:

```bash
# Option A — safe read-only smoke against the running app + real MySQL
# (health, store list, seed-account login; no data mutation):
DB_HOST=127.0.0.1 DB_NAME=store_rating_db DB_USER=store_app DB_PASSWORD=******** \
  JWT_SECRET=<64 hex> npm run db:smoke:mysql

# Option B — logic suite as shipped (SQLite test-only), used in CI:
npm test
```

`scripts/mysql-smoke.js` boots the real server with your `DB_*` env (same
code path as production, minus the production-only guards), waits for
`/api/health`, then checks: health 200, store catalog loads, seeded customer
login succeeds, and a disabled login fails — then shuts the server down. It
never writes data.

## 6. Manual smoke checklist (real browser + real MySQL)

1. `NODE_ENV=production PORT=5000 CLIENT_URL=https://app.example.com JWT_SECRET=<64 hex> node server.js`
   — boots only after migration; hit `/api/health` → 200.
2. Register → browse → favorite → book → complete → rate/review (customer).
3. Owner dashboard numbers match bookings in DB; approve/reject a booking.
4. Admin: create/modify users, disable a user → their token is rejected
   immediately (401).
5. Admin review moderation: hide → disappears from store; restore → returns.
6. Restart the API — no schema changes occur (`schema_migrations` unchanged).
7. Stop MySQL → `/api/health` returns **503 generic** (no stack/credentials).

## 7. Recording the result

Run the commands above, then update the readiness report
(`docs/PRODUCTION_DEPLOYMENT_READINESS_REPORT.md`): replace
**REAL MYSQL 8: NOT VERIFIED** with the executed result (pass count, server
version, date) and re-score.
