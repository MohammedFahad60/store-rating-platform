#!/usr/bin/env node
/**
 * Real-MySQL smoke test (Phase 4G, Option A).
 *
 * Boots the real server with the caller's DB_* environment (mysql dialect),
 * waits for /api/health, then performs READ-ONLY checks + a login round-trip:
 *
 *   1. GET /api/health            -> 200, database: connected
 *   2. GET /api/stores?limit=3    -> 200, stores array
 *   3. POST /api/auth/login       -> seeded customer login succeeds
 *   4. POST /api/auth/login       -> wrong password is rejected (401)
 *
 * No data is created, updated or deleted. The server is stopped afterwards.
 *
 * Usage (from Backend/):
 *   DB_HOST=... DB_PORT=3306 DB_NAME=... DB_USER=... DB_PASSWORD=... \
 *   JWT_SECRET=<64-hex> npm run db:smoke:mysql
 *
 * Exit code: 0 = all checks passed.
 */

const { spawn } = require("node:child_process");
const path = require("node:path");

const PORT = 5097;
const BASE = `http://127.0.0.1:${PORT}/api`;
const failures = [];

function check(name, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

async function waitForHealth(child, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early (code ${child.exitCode})`);
    }
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.status === 200) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: "development", // production guards intentionally skipped; tests are local
  };
  if (!env.DB_NAME || !env.DB_USER || !env.DB_HOST) {
    console.error("Missing DB_* env: set DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD (see Backend/.env.example).");
    process.exit(2);
  }
  if (!env.DB_PASSWORD) console.warn("WARNING: DB_PASSWORD is empty — passwordless local connection.");

  console.log(`Starting server against ${env.DB_HOST}:${env.DB_PORT || 3306}/${env.DB_NAME} ...`);
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (d) => (logs += d));
  child.stderr.on("data", (d) => (logs += d));

  try {
    const healthy = await waitForHealth(child);
    check(`Server started against real MySQL (${env.DB_NAME})`, healthy,
      healthy ? "" : logs.split("\n").slice(-6).join(" "));

    if (healthy) {
      const health = await (await fetch(`${BASE}/health`)).json();
      check("GET /api/health -> 200 / database connected",
        health.success === true && health.status === "ok" && health.database === "connected");

      const loginOk = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "aisha@gmail.com", password: "User@123" }),
      });
      const okBody = await loginOk.json();
      // The login response exposes the user as FLAT fields (token, id, name,
      // email, phone, role) — matching authController.js.
      check("Seeded customer login succeeds (bcrypt + JWT)",
        loginOk.status === 200 && Boolean(okBody.token) && okBody.email === "aisha@gmail.com",
        `status=${loginOk.status} ${okBody.message || ""} ${okBody.email || "no email"}`);

      // /api/stores is an authenticated route (browse requires login): call it
      // with the token obtained above.
      const storesRes = await fetch(`${BASE}/stores?limit=3`, {
        headers: { Authorization: `Bearer ${okBody.token}` },
      });
      const stores = await storesRes.json();
      // The list endpoint returns the array under `data` (see storeController).
      check("GET /api/stores -> 200 with store rows (authenticated)",
        storesRes.status === 200 && Array.isArray(stores.data) && stores.data.length > 0,
        `status=${storesRes.status} ${stores.data?.length ?? 0} store(s)`);

      const loginBad = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "aisha@gmail.com", password: "definitely-wrong" }),
      });
      check("Wrong password rejected (401)", loginBad.status === 401);

      const disabled = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "disabled@storerating.com", password: "User@123" }),
      });
      // Disabled accounts get a clear 403 (not a generic 401).
      check("Disabled account rejected", disabled.status === 403);

      // Health must NOT leak credentials/paths/stack in any case.
      if (loginBad.status === 401 || loginOk.status === 200) {
        const leak = JSON.stringify(okBody).match(/password|JWT|stack|DB_HOST|DB_PASSWORD/i);
        check("Login responses never leak secrets", !leak);
      }
    }
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1500));
    if (child.exitCode === null) child.kill("SIGKILL");
  }

  console.log(`\nRESULT: ${failures.length === 0 ? "ALL CHECKS PASSED" : `FAILED: ${failures.join(" | ")}`}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Smoke test could not complete:", e.message);
  process.exit(1);
});
