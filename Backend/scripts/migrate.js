/**
 * Production migration CLI.
 *
 *   npm run db:migrate            # apply all pending migrations
 *   npm run db:migrate:status     # show applied / pending migrations
 *
 * Safe to run repeatedly against an empty or already-migrated MySQL 8
 * database. This is the ONLY supported way to manage the production schema -
 * `sequelize.sync({ alter: true })` is never used by the application.
 */
require("dotenv").config({ quiet: true });

let sequelize;
let runner;
try {
  ({ sequelize } = require("../models"));
  runner = require("../utils/migrate");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const { runMigrations, migrationStatus } = runner;

const isStatus = process.argv.includes("--status");

async function main() {
  await sequelize.authenticate();
  console.log(`[migrate] Connected (dialect: ${sequelize.getDialect()})`);

  if (isStatus) {
    const status = await migrationStatus();
    console.log(`[migrate] Applied (${status.applied.length}):`);
    status.applied.forEach((file) => console.log(`  ✔ ${file}`));
    console.log(`[migrate] Pending (${status.pending.length}):`);
    status.pending.forEach((file) => console.log(`  ✘ ${file}`));
    if (status.pending.length === 0) {
      console.log("[migrate] Schema is up to date.");
    }
    await sequelize.close();
    process.exit(0);
  }

  const result = await runMigrations({ log: console.log });
  console.log(`[migrate] ${result.applied.length} applied, ${result.skipped.length} already applied.`);
  await sequelize.close();
  process.exit(0);
}

main().catch(async (error) => {
  console.error("[migrate] Failed:", error.message);
  try {
    await sequelize.close();
  } catch {
    // ignore close errors on failure
  }
  process.exit(1);
});
