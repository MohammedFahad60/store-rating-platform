# Production Deployment Guide

**Project:** STORE (Store Management & Customer Experience Platform)
**Applies to:** Phase 4D / 4P — Backend (Node/Express + Sequelize + MySQL 8) and
Frontend (React + Vite).

This guide is **provider-agnostic**. It explains the production contract of
the app and shows how to apply it on any host that offers a Node.js runtime, a
MySQL 8 database and static hosting (Render, Railway, Fly.io, AWS
EC2/Elastic Beanstalk/ECS, Vercel, Netlify, Cloudflare Pages, a VM with
Caddy/Nginx, …). No provider is hardcoded in the application.

---

## 1. Production architecture

```
Browser ──HTTPS──> Frontend (static build, Vite/React)
                     |  reads VITE_API_URL (build time) or same-origin /api
                     v
                 Reverse proxy (TLS termination)
                     |
                     v
             Backend API (Node, PORT from env)  ──mysql2──> MySQL 8
```

- The backend is **stateless** → at least one replica can run behind any
  load balancer.
- The frontend is a **static build** (`dist/`) — deploy it to any static host
  or serve it from a web server / CDN.
- Database migrations run **once, explicitly, before the first app start** —
  never automatically at startup.

---

## 2. Backend environment variables (production)

Copy `Backend/.env.example` to `Backend/.env` (or set them in your host's
secret manager) and fill in:

| Variable        | Required | Example                                    | Notes |
|-----------------|----------|--------------------------------------------|-------|
| `NODE_ENV`      | ✅        | `production`                               | Enables prod config guards, trust proxy, CSP, safe error handling. |
| `PORT`          | ✅        | `5000`                                     | Host injects this on PaaS. |
| `DB_HOST`       | ✅        | `db.internal`                              | MySQL 8 host. |
| `DB_PORT`       | ✅        | `3306`                                     | Defaults to 3306. |
| `DB_NAME`       | ✅        | `store_rating_db`                          | **Must exist before startup** (create + migration). |
| `DB_USER`       | ✅        | `store_app`                                | Least-privilege user (DML + DDL for migrations only). |
| `DB_PASSWORD`   | ✅        | (secret)                                   | **Required in production** — the server refuses to start without it. |
| `DB_LOGGING`    | optional  | `false`                                    | SQL logging (off in production). |
| `JWT_SECRET`    | ✅        | 64 hex chars from `crypto.randomBytes(32)` | Must be **≥ 32 chars and not the dev default** — startup fails otherwise. |
| `JWT_EXPIRES_IN`| optional  | `1d`                                       | Token lifetime (defaults to `1d`). |
| `CLIENT_URL`    | ✅        | `https://app.example.com`                  | Comma-separated CORS allow-list of frontend origins. Startup fails without it in production. |

The server also refuses to start with `DB_DIALECT=sqlite` in production
(SQLite is test-only) and verifies that the schema exists before listening.

### Generate a JWT secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 3. Database: create, migrate, seed

```sql
CREATE DATABASE store_rating_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Then, once, with the production credentials:

```bash
cd Backend
npm ci
npm run db:migrate           # applies all tracked migrations (idempotent)
npm run db:migrate:status    # confirm: all applied
npm run seed                 # ONLY on the first environment (demo data)
```

> **Never** rely on `sequelize.sync()` in production. Startup does not
> create/alter/drop schema — it only verifies it exists (`schemaReady`).

### Backups
- Enable **automated backups** on the managed MySQL (Render/Railway/AWS RDS).
- Test restoring a backup before the first real release.

---

## 4. Backend deployment (any provider)

### 4.1 Render (managed)
- New **Web Service** → repo/`Backend` (root directory `Backend`), build
  `npm ci`, start `NODE_ENV=production node server.js`.
- Add an RDS-like managed MySQL (Render PostgreSQL-compatible? — **use a MySQL
  provider**: Render *does* offer MySQL as a managed database) and set the
  `DB_*` vars from its connection string.
- Pre-deploy command: `npm run db:migrate` (Render "pre-deploy" hook) or run
  migrations from your CI against the same DB.
- Set `CLIENT_URL` to the frontend URL; `JWT_SECRET` in the secret store.
- Health check path: `/api/health`.

### 4.2 Railway
- Deploy `Backend` from repo; add a **MySQL 8** plugin/reference; Railway
  injects `DATABASE_URL`-style vars — map them to `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`.
- Deploy command: `NODE_ENV=production node server.js`; use Railway's
  *pre-deploy* command for `npm run db:migrate`.
- Railway provides the public URL + TLS; set `CLIENT_URL` to the frontend URL.

### 4.3 AWS (EC2 / Elastic Beanstalk / ECS Fargate)
- **RDS MySQL 8** with a least-privilege user; DB subnet + security group
  allowing only the app tier.
- Environment variables via SSM Parameter Store / Secrets Manager or
  Beanstalk env properties. Never bake secrets into the image.
- Run `npm run db:migrate` as a **one-shot task / CI job** before the first
  healthy instance (safe because migrations are tracked and idempotent).
- TLS: ALB + ACM certificate, or an Nginx/Caddy reverse proxy in front of the
  app; set `CLIENT_URL=https://your-domain.com`.
- ECS: run the same `node server.js` process; target group health check
  `GET /api/health` (200/503 — ELB treats 503 as unhealthy, which is correct
  if the DB is down).

### 4.4 A plain VM (Docker / systemd)
```bash
# Docker
docker build -t store-api .
docker run -d --name store-api --restart unless-stopped \
  -p 127.0.0.1:5000:5000 \
  --env-file .env.production \
  store-api
```
Reverse proxy (Caddy example — automatic HTTPS):
```
app.example.com {
    reverse_proxy 127.0.0.1:5000
}
```

---

## 5. Frontend deployment

The frontend is a static Vite build; **any** static host works.

### Build
```bash
cd Frontend
npm ci
# Same origin (recommended: reverse proxy / API on the same host):
npm run build
# Different origin (API on another domain):
VITE_API_URL=https://api.example.com/api npm run build
```

### Same-origin strategy (recommended)
Serve `dist/` from the same domain as the API and route `/api` to the backend.
Example Nginx:

```nginx
server {
  listen 443 ssl;
  server_name app.example.com;
  root /var/www/store/frontend/dist;
  location / { try_files $uri /index.html; }
  location /api/ { proxy_pass http://127.0.0.1:5000; }
}
```

The frontend defaults to the **relative** `/api` origin, so no build-time
variable is needed.

### Vercel
- Framework preset: **Vite**; build `npm run build`; output `dist`.
- Set `VITE_API_URL` only if the API is on another origin (build-time).
- For the API itself, Vercel Functions are **not the app's runtime** — deploy
  the Node backend separately (Render/Railway/EC2) and point
  `VITE_API_URL` at it.
- Add a rewrite when co-deploying via a proxy:
  `{ "rewrites": [{ "source": "/api/(.*)", "destination": "https://api.example.com/api/$1" }] }`.

### Netlify
- Build command `npm run build`, publish directory `dist`.
- If `VITE_API_URL` is set, it is a **build-time** variable.
- Add a proxy rule in `netlify.toml` (or the dashboard) for `/api/*` when
  serving the API from the same Netlify site:
  ```toml
  [[redirects]]
    from = "/api/*"
    to = "https://api.example.com/api/:splat"
    status = 200
  ```

> The Vite dev-server proxy (`VITE_PROXY_TARGET`) is **development only**.
> Production routing is done by the host (reverse proxy / redirects) or by
> `VITE_API_URL` at build time.

---

## 6. HTTPS / TLS

- Terminate TLS at the load balancer / proxy / PaaS edge (Render, Railway,
  ALB, Caddy, Nginx, Cloudflare all provide certificates).
- The backend sets `app.set("trust proxy", 1)` in production so the real
  client IP reaches the rate limiter.
- Keep `helmet` enabled (CSP is enabled in production builds; disable only if
  you need inline scripts on the deployed frontend, and then scope it).
- Set `CLIENT_URL` to the **https** origin exactly (no trailing slash); both
  must match the origin the browser sends.

---

## 7. Runtime operations checklist

- [ ] `npm run db:migrate` has run for the release before the app starts.
- [ ] `GET /api/health` returns `200 {success,status:"ok",database:"connected"}`.
- [ ] Health-checked by the platform (200 on success, **503 when the DB is down**).
- [ ] `JWT_SECRET` unique per environment, ≥32 chars, in a secret store.
- [ ] `CLIENT_URL` matches the real frontend origin.
- [ ] No `.env` committed; no secrets in logs (structured logger never logs
      bodies/auth headers).
- [ ] Automated backups are enabled and a restore was tested.
- [ ] Logs aggregated (stdout JSON lines: `line/method/route/status/duration/requestId`).
- [ ] Release = rebuild → migration → rolling restart (stateless backend).

---

## 8. Health endpoint

| Path          | Success                                   | Failure                                  |
|---------------|-------------------------------------------|------------------------------------------|
| `GET /api/health` | `200 {success:true, status:"ok", database:"connected", uptime, timestamp}` | `503 {success:false, status:"unavailable", message:"Service is temporarily unavailable"}` |

The failure body contains **no credentials, hostnames or stack traces** and
is safe to expose to load-balancer probes.

---

## 9. Verification after deployment

```bash
# API
curl -fsS https://api.example.com/api/health

# MySQL 8 integrity (see docs/MYSQL8_VERIFICATION.md)
DB_HOST=... DB_NAME=... DB_USER=... DB_PASSWORD=... \
  npm run db:verify:mysql -- --integrity

# Backend contract suite (logic-level, SQLite test-only)
cd Backend && npm test && npm run lint

# Browser journeys (local, requires Chromium)
cd Frontend && npm run test:e2e:browser
```
