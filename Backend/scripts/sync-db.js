/**
 * Legacy development helper kept for backwards compatibility.
 *
 * This used to run sequelize.sync({ alter: true }) - a development-only
 * convenience that is no longer used anywhere in the application.
 *
 * It now delegates to the real migration system so the development schema
 * always matches the production schema.
 *
 * Usage: npm run db:sync   ->  same as npm run db:migrate
 */
require("dotenv").config({ quiet: true });

let sequelize;
let runMigrations;
try {
  ({ sequelize } = require("../models"));
  ({ runMigrations } = require("../utils/migrate"));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

async function main() {
  console.log("[db:sync] NOTE: npm run db:sync now runs the real migrations (see npm run db:migrate).");
  await sequelize.authenticate();
  const result = await runMigrations({ log: console.log });
  console.log(`[db:sync] ${result.applied.length} applied, ${result.skipped.length} already applied.`);
  await sequelize.close();
  process.exit(0);
}

main().catch(async (error) => {
  console.error("[db:sync] Failed:", error.message);
  try {
    await sequelize.close();
  } catch {
    // ignore
  }
  process.exit(1);
});
