import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
import chromium from "@sparticuz/chromium";

// Sandbox/CI-friendly Chromium: the browser binary ships inside the
// @sparticuz/chromium npm package (no CDN download needed). Locally, a
// regular Chromium install can be used by removing this override.
const executablePath = await chromium.executablePath();

// The sandbox Chromium build is linked against NSS/NSPR libraries that this
// environment does not install system-wide; when they are available in the
// local prefix, point the browser's dynamic linker at them.
const NSS_LIB_DIR = "/home/user/mysql-build/tools/lib";
const browserEnv = existsSync(`${NSS_LIB_DIR}/libnss3.so`)
  ? { ...process.env, LD_LIBRARY_PATH: `${NSS_LIB_DIR}:${process.env.LD_LIBRARY_PATH || ""}` }
  : undefined;

/**
 * Browser E2E (Phase 4F).
 *
 * Runs the real React app against a real API server backed by a throwaway
 * SQLite database (test-only, per project policy) that is re-seeded with the
 * deterministic demo dataset on every cold start.
 *
 *   cd Frontend && npm run test:e2e:browser
 *
 * Requirements: free ports 5173 (Vite) and 5098 (API). Chromium is provided
 * by the @sparticuz/chromium dependency.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:5180",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath,
      // Keep the Lambda build's sandbox/GPU/compat flags but drop
      // --single-process / --no-zygote / explicit --headless: Playwright
      // manages headless mode itself, and a single-process browser hangs
      // when a second page/context is created.
      args: chromium.args.filter(
        (a) => !a.includes("single-process") && !a.includes("no-zygote") && !a.startsWith("--headless")
      ),
      env: browserEnv,
    },
  },
  webServer: [
    {
      // Fresh throwaway SQLite (test-only per project policy), re-seeded,
      // then start the API on a dedicated port. DB_* variables must be
      // exported for both `node seed.js` and `node server.js`.
      command:
        "rm -f .tmp-playwright.sqlite && node seed.js && node server.js",
      env: {
        DB_DIALECT: "sqlite",
        DB_STORAGE: "./.tmp-playwright.sqlite",
        JWT_SECRET: "playwright-e2e-secret-0123456789",
        CLIENT_URL: "http://localhost:5180",
        PORT: "5098",
      },
      cwd: "../Backend",
      url: "http://localhost:5098/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Vite dev server; /api is proxied to the API on 5098.
      command: "npm run dev",
      env: {
        VITE_PROXY_TARGET: "http://localhost:5098",
        VITE_PORT: "5180",
      },
      url: "http://localhost:5180",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
