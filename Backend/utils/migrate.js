const fs = require("fs");
const path = require("path");
const { DataTypes, QueryTypes } = require("sequelize");
const { sequelize } = require("../models");

/**
 * Lightweight, reproducible migration runner.
 *
 * - Migrations live in ./migrations as numbered `NNNN-description.js`
 *   files exporting `{ up(queryInterface, Sequelize), down(...) }`.
 * - Applied migrations are tracked in a `schema_migrations` table, so both
 *   MySQL 8 and the SQLite test database can be migrated from scratch, and
 *   re-running is a no-op.
 * - This is the ONLY schema-management path used by production, the seed
 *   script and automated tests. `sequelize.sync({ alter: true })` is never
 *   used by the application.
 */
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");
const META_TABLE = "schema_migrations";

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d+.*\.js$/.test(name))
    .sort();
}

async function ensureMetaTable(queryInterface) {
  const tables = await queryInterface.showAllTables();
  const exists = tables.some((table) => {
    const name = String(table?.tableName || table || "").toLowerCase();
    return name === META_TABLE.toLowerCase();
  });
  if (exists) return;

  await queryInterface.createTable(META_TABLE, {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    executedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  await queryInterface.addIndex(META_TABLE, ["name"], {
    unique: true,
    name: "schema_migrations_name_unique",
  });
}

async function getExecutedMigrations() {
  const rows = await sequelize.query(`SELECT name FROM ${META_TABLE}`, {
    type: QueryTypes.SELECT,
  });
  return new Set(rows.map((row) => String(row.name)));
}

/**
 * Apply every pending migration. Migration files are executed in lexical
 * order; each is recorded only after its `up()` completed successfully.
 * Returns `{ applied, skipped, files }`.
 */
async function runMigrations({ log = () => {} } = {}) {
  const queryInterface = sequelize.getQueryInterface();
  const files = listMigrationFiles();

  await ensureMetaTable(queryInterface);
  const executed = await getExecutedMigrations();

  const applied = [];
  const skipped = [];

  for (const file of files) {
    if (executed.has(file)) {
      skipped.push(file);
      continue;
    }

    log(`[migrate] Applying ${file} ...`);
    // eslint-disable-next-line global-require
    const migration = require(path.join(MIGRATIONS_DIR, file));
    if (typeof migration.up !== "function") {
      throw new Error(`Migration ${file} does not export an up() function`);
    }

    await migration.up(queryInterface, DataTypes);
    await queryInterface.bulkInsert(META_TABLE, [{ name: file, executedAt: new Date() }]);
    log(`[migrate] Applied ${file}`);
    applied.push(file);
  }

  return { applied, skipped, files };
}

/**
 * Report which migrations are applied vs pending. Does not mutate the schema.
 */
async function migrationStatus() {
  const queryInterface = sequelize.getQueryInterface();
  await ensureMetaTable(queryInterface);
  const executed = await getExecutedMigrations();
  const files = listMigrationFiles();
  return {
    applied: files.filter((file) => executed.has(file)),
    pending: files.filter((file) => !executed.has(file)),
    files,
  };
}

/**
 * Returns true when every model table that the application expects exists.
 * Used by production startup to fail fast with a clear message instead of
 * silently auto-syncing or altering the schema.
 */
async function schemaReady() {
  const existing = (await sequelize.getQueryInterface().showAllTables()).map(
    (table) => String(table?.tableName || table).toLowerCase()
  );
  return Object.values(sequelize.models).every((model) =>
    existing.includes(String(model.getTableName()).toLowerCase())
  );
}

module.exports = {
  runMigrations,
  migrationStatus,
  schemaReady,
  MIGRATIONS_DIR,
  META_TABLE,
};
