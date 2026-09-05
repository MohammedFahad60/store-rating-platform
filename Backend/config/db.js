const { Sequelize } = require("sequelize");

/**
 * Database configuration.
 *
 * DEVELOPMENT / PRODUCTION -> MySQL 8 / TiDB Cloud Starter
 * TESTS / throwaway runs   -> SQLite
 */
const dialect = String(process.env.DB_DIALECT || "mysql").toLowerCase();

let sequelize;

if (dialect === "sqlite") {
  // Used ONLY by automated tests / local verification.
  let sqliteDialectModule = null;

  try {
    sqliteDialectModule = require("sqlite3");
    if (!sqliteDialectModule.Database) {
      throw new Error("sqlite3 missing Database");
    }
  } catch (_) {
    try {
      sqliteDialectModule = require("../utils/sqliteShim");
    } catch (e2) {
      throw new Error(
        "Failed to load sqlite3 and fallback shim. Ensure Node >=22 for node:sqlite. " +
          e2.message
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

  if (!database) {
    throw new Error(
      "[Config Error] DB_NAME is required when DB_DIALECT is mysql"
    );
  }

  if (!username) {
    throw new Error(
      "[Config Error] DB_USER is required when DB_DIALECT is mysql"
    );
  }

  sequelize = new Sequelize(database, username, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    dialect: "mysql",

    // Explicitly use mysql2.
    dialectModule: require("mysql2"),

    // Required for TiDB Cloud Starter public connections.
    dialectOptions:
  process.env.NODE_ENV === "production"
    ? {
        ssl: {
          minVersion: "TLSv1.2",
          rejectUnauthorized: true,
        },
      }
    : undefined,

    logging: process.env.DB_LOGGING === "true" ? console.log : false,

    define: {
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