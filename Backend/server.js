require("dotenv").config({ quiet: true });

let app;
let sequelize;
let migrateHelpers;
try {
  app = require("./app");
  ({ sequelize } = require("./models"));
  migrateHelpers = require("./utils/migrate");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 5000;
const isProduction = process.env.NODE_ENV === "production";
const isSqlite = process.env.DB_DIALECT === "sqlite";
const DEV_JWT_SECRET = "change-me-to-a-long-random-string";

// ==========================================
// ENVIRONMENT VALIDATION - fail fast with a clear message
// ==========================================
function requireEnv(key) {
  const value = process.env[key];
  if (!value) {
    console.error(`[Config Error] Missing required environment variable: ${key}`);
    console.error("Copy Backend/.env.example to Backend/.env and fill in the values.");
    process.exit(1);
  }
  return value;
}

if (isProduction && isSqlite) {
  console.error(
    "[Config Error] SQLite is a TEST-ONLY database. Set DB_DIALECT=mysql (unset it) for development/production."
  );
  process.exit(1);
}

if (!isSqlite) {
  requireEnv("DB_NAME");
  requireEnv("DB_USER");
  requireEnv("DB_HOST");
  if (isProduction) requireEnv("DB_PASSWORD");
}

const jwtSecret = requireEnv("JWT_SECRET");

if (isProduction) {
  if (!process.env.CLIENT_URL) {
    console.error("[Config Error] CLIENT_URL (allowed CORS origin) is required in production.");
    process.exit(1);
  }
  if (jwtSecret === DEV_JWT_SECRET || jwtSecret.length < 32) {
    console.error(
      "[Config Error] JWT_SECRET must be a long, random, non-default string in production (>= 32 chars)."
    );
    process.exit(1);
  }
} else if (jwtSecret === DEV_JWT_SECRET) {
  console.warn("[Config Warn] JWT_SECRET is still the development default - set a real secret.");
}

// ==========================================
// STARTUP
// ==========================================
async function start() {
  try {
    await sequelize.authenticate();
    console.log(
      `[DB] Connected to ${isSqlite ? "SQLite (test-only)" : `MySQL @ ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME}`}`
    );

    if (isProduction) {
      // Production schema is created by `npm run db:migrate` BEFORE startup.
      // sync({ alter: true }) and destructive synchronization are NEVER run here.
      const ready = await migrateHelpers.schemaReady();
      if (!ready) {
        console.error(
          "[DB] Schema is missing tables. Run `npm run db:migrate` against the configured database, then start the server again."
        );
        process.exit(1);
      }
      console.log("[DB] Schema verified - migrations are up to date");
    } else {
      // Development/test convenience only: apply tracked migrations.
      // This never alters an existing schema (migrations are idempotent).
      const result = await migrateHelpers.runMigrations({ log: (line) => console.log(line) });
      if (result.applied.length > 0) {
        console.log(`[DB] Applied ${result.applied.length} migration(s)`);
      }
    }

    const server = app.listen(PORT, () => {
      console.log(`[Server] STORE Platform API listening on port ${PORT}`);
    });

    // ==========================================
    // GRACEFUL SHUTDOWN (SIGINT / SIGTERM)
    // ==========================================
    let shuttingDown = false;

    const shutdown = (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[Server] Received ${signal} - shutting down gracefully...`);

      // Hard exit if close hangs (e.g. an open keep-alive connection).
      const forceTimer = setTimeout(() => {
        console.error("[Server] Shutdown timed out - forcing exit");
        process.exit(1);
      }, 10000);
      forceTimer.unref();

      server.close(async (closeError) => {
        if (closeError) {
          console.error("[Server] Error while closing HTTP server:", closeError.message);
        }
        try {
          await sequelize.close();
          console.log("[Server] Database connection closed");
        } catch (dbError) {
          console.error("[Server] Error while closing database connection:", dbError.message);
        }
        process.exit(closeError ? 1 : 0);
      });

      // Close idle pool connections so the process can exit promptly.
      setTimeout(() => {
        sequelize
          .close()
          .catch(() => {})
          .finally(() => {});
      }, 500).unref();
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    console.error("[Server] Failed to start:", err.message);
    try {
      await sequelize.close();
    } catch {
      // ignore
    }
    process.exit(1);
  }
}

start();
