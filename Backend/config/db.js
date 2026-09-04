const { Sequelize } = require("sequelize");

/**
 * Database configuration.
 *
 * DEVELOPMENT / PRODUCTION  -> MySQL 8 (mysql2 + Sequelize)
 * TESTS / throwaway runs     -> SQLite (DB_DIALECT=sqlite) - intentionally
 *                               isolated so SQLite can never silently become
 *                               the production database.
 */
const dialect = String(process.env.DB_DIALECT || "mysql").toLowerCase();

let sequelize;

if (dialect === "sqlite") {
  // Used ONLY by automated tests / local verification without a MySQL server.
  // Try native sqlite3 first; fall back to pure-JS shim (node:sqlite) when
  // native bindings are unavailable in the sandbox — production never uses this.
  let sqliteDialectModule = null;
  try {
    sqliteDialectModule = require("sqlite3");
    if (!sqliteDialectModule.Database) throw new Error("sqlite3 missing Database");
  } catch (_) {
    try {
      sqliteDialectModule = require("../utils/sqliteShim");
    } catch (e2) {
      throw new Error(
        "Failed to load sqlite3 and fallback shim. Ensure Node >=22 for node:sqlite. " + e2.message
      );
    }
  }
  sequelize = new Sequelize({
    dialect: "sqlite",
    storage: process.env.DB_STORAGE || ":memory:",
    logging: false,
    dialectModule: sqliteDialectModule,
  });
} else if (dialect === "mysql") {
  const database = process.env.DB_NAME;
  const username = process.env.DB_USER;

  // Fail fast with a clear message instead of silently connecting as root/''.
  if (!database) {
    throw new Error(
      "[Config Error] DB_NAME is required when DB_DIALECT is mysql (see Backend/.env.example)"
    );
  }
  if (!username) {
    throw new Error(
      "[Config Error] DB_USER is required when DB_DIALECT is mysql (see Backend/.env.example)"
    );
  }

  sequelize = new Sequelize(database, username, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    dialect: "mysql",
    // Explicitly use the mysql2 driver (the production dialect).
    dialectModule: require("mysql2"),
    logging: process.env.DB_LOGGING === "true" ? console.log : false,
    define: {
      // Full Unicode support for MySQL 8.
      charset: "utf8mb4",
      collate: "utf8mb4_unicode_ci",
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  });
} else {
  throw new Error(
    `[Config Error] Unsupported DB_DIALECT "${process.env.DB_DIALECT}". Use "mysql" (development/production) or "sqlite" (tests only).`
  );
}

module.exports = sequelize;
