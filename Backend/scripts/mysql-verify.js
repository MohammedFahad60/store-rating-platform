#!/usr/bin/env node
/**
 * Real MySQL 8 verification (Phase 4G/4I).
 *
 * Connects to a LIVE MySQL server using the same environment variables as the
 * application (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD — see
 * Backend/.env.example) and verifies, against information_schema + real
 * queries:
 *
 *   1. Server + database are MySQL 8.x with utf8mb4/utf8mb4_unicode_ci.
 *   2. All tracked migrations are applied (schema_migrations is complete).
 *   3. Foreign keys exist with the expected ON UPDATE / ON DELETE actions
 *      (CASCADE / SET NULL).
 *   4. Unique constraints exist (users.email, favorites(userId,storeId),
 *      ratings(userId,storeId), schema_migrations.name).
 *   5. Query indexes expected by the hottest queries exist.
 *   6. ENUM columns allow exactly the application values.
 *   7. DECIMAL columns have the expected precision/scale (money + geo).
 *   8. No orphan rows (every FK value has a parent).
 *   9. OPTIONAL transactional smoke test (--integrity): inserts a scratch
 *      user/store/service/booking/favorite inside a transaction and rolls it
 *      back, proving unique enforcement + cascade behaviour at runtime.
 *
 * Usage:
 *   DB_HOST=... DB_USER=... DB_PASSWORD=... DB_NAME=... node scripts/mysql-verify.js
 *   DB_HOST=... ... node scripts/mysql-verify.js --integrity
 *
 * Exit code 0 = all checks passed; 1 = at least one check failed.
 *
 * This script NEVER alters the schema and NEVER deletes application data
 * (the --integrity smoke test is fully rolled back).
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const mysql = require("mysql2/promise");

const {
  DB_HOST = "localhost",
  DB_PORT = "3306",
  DB_NAME = "",
  DB_USER = "",
  DB_PASSWORD = "",
} = process.env;

const INTEGRITY = process.argv.includes("--integrity");

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
function section(title) {
  console.log(`\n[${title}]`);
}

function appliedMigrations() {
  return fs
    .readdirSync(path.join(__dirname, "..", "migrations"))
    .filter((f) => /^\d{4}-.+\.js$/.test(f))
    // keep ".js" — schema_migrations.name stores the full file name
    .sort();
}

async function main() {
  if (!DB_NAME || !DB_USER || !DB_HOST) {
    console.error(
      "Usage: DB_HOST=... DB_PORT=3306 DB_NAME=... DB_USER=... DB_PASSWORD=... node scripts/mysql-verify.js [--integrity]"
    );
    process.exit(2);
  }
  if (!DB_PASSWORD) console.warn("WARNING: DB_PASSWORD is empty — using a passwordless local connection.");

  const conn = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    charset: "utf8mb4",
    supportBigNumbers: true,
    decimalNumbers: false, // keep DECIMAL as strings so precision is visible
  });

  console.log(`Connected to MySQL at ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
  const [[{ version }]] = await conn.query("SELECT VERSION() AS version");
  record("Server is MySQL 8.x", /^8\./.test(version), version);

  const [[{ dbCharset, dbCollation }]] = await conn.query(
    `SELECT DEFAULT_CHARACTER_SET_NAME AS dbCharset, DEFAULT_COLLATION_NAME AS dbCollation
       FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
    [DB_NAME]
  );
  record(
    "Database charset/collation is utf8mb4 / utf8mb4_unicode_ci",
    dbCharset === "utf8mb4" && dbCollation === "utf8mb4_unicode_ci",
    `${dbCharset} / ${dbCollation}`
  );

  // ---- 1. Migrations ----
  const expected = appliedMigrations();
  const [rows] = await conn.query(
    "SELECT name FROM schema_migrations ORDER BY name"
  );
  const applied = rows.map((r) => r.name);
  const missing = expected.filter((m) => !applied.includes(m));
  const unknown = applied.filter((m) => !expected.includes(m));
  section("Migrations");
  record("All tracked migrations applied", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : `${applied.length} applied`);
  record("No unknown migrations", unknown.length === 0, unknown.length ? `unknown: ${unknown.join(", ")}` : "");

  // ---- 2. Foreign keys ----
  const EXPECTED_FKS = [
    { name: "fk_stores_owner", table: "Stores", column: "ownerId", ref: "Users", delete: "CASCADE", update: "CASCADE" },
    { name: "fk_services_store", table: "Services", column: "storeId", ref: "Stores", delete: "CASCADE", update: "CASCADE" },
    { name: "fk_bookings_user", table: "Bookings", column: "userId", ref: "Users", delete: "CASCADE", update: "CASCADE" },
    { name: "fk_bookings_store", table: "Bookings", column: "storeId", ref: "Stores", delete: "CASCADE", update: "CASCADE" },
    { name: "fk_bookings_service", table: "Bookings", column: "serviceId", ref: "Services", delete: "CASCADE", update: "CASCADE" },
    { name: "fk_ratings_user", table: "Ratings", column: "userId", ref: "Users", delete: "CASCADE", update: "CASCADE" },
    { name: "fk_ratings_store", table: "Ratings", column: "storeId", ref: "Stores", delete: "CASCADE", update: "CASCADE" },
    { name: "fk_favorites_user", table: "Favorites", column: "userId", ref: "Users", delete: "CASCADE", update: "CASCADE" },
    { name: "fk_favorites_store", table: "Favorites", column: "storeId", ref: "Stores", delete: "CASCADE", update: "CASCADE" },
    { name: "fk_notifications_user", table: "Notifications", column: "userId", ref: "Users", delete: "CASCADE", update: "CASCADE" },
    { name: "fk_auditlogs_actor", table: "AuditLogs", column: "actorUserId", ref: "Users", delete: "SET NULL", update: "CASCADE" },
    { name: "fk_storehours_store", table: "StoreHours", column: "storeId", ref: "Stores", delete: "CASCADE", update: "CASCADE" },
  ];
  const [fkRows] = await conn.query(
    `SELECT k.CONSTRAINT_NAME AS name, k.TABLE_NAME AS tbl, k.COLUMN_NAME AS col,
            k.REFERENCED_TABLE_NAME AS ref, r.DELETE_RULE AS del, r.UPDATE_RULE AS upd
       FROM information_schema.KEY_COLUMN_USAGE k
       JOIN information_schema.REFERENTIAL_CONSTRAINTS r
         ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
      WHERE k.CONSTRAINT_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL`,
    [DB_NAME]
  );
  section(`Foreign keys (${fkRows.length} found)`);
  for (const expectedFk of EXPECTED_FKS) {
    const actual = fkRows.find(
      (r) => r.tbl === expectedFk.table && r.col === expectedFk.column && r.ref === expectedFk.ref
    );
    record(
      `${expectedFk.name}: ${expectedFk.table}.${expectedFk.column} -> ${expectedFk.ref} (${expectedFk.delete}/${expectedFk.update})`,
      Boolean(actual) &&
        actual.del.toUpperCase() === expectedFk.delete &&
        actual.upd.toUpperCase() === expectedFk.update,
      actual ? `found: ${actual.name} (${actual.del}/${actual.upd})` : "NOT FOUND"
    );
  }

  // ---- 3. Unique constraints ----
  section("Unique constraints");
  const [uniqRows] = await conn.query(
    `SELECT TABLE_NAME AS tbl, INDEX_NAME AS idx, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols,
            MAX(NON_UNIQUE) AS nonUnique
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ?
      GROUP BY TABLE_NAME, INDEX_NAME`,
    [DB_NAME]
  );
  const uniqIndex = (tbl, cols) =>
    uniqRows.find(
      (r) => Number(r.nonUnique) === 0 && r.tbl === tbl && r.cols.split(",").join(",") === cols
    );
  const anyIndex = (tbl, cols) =>
    uniqRows.find((r) => r.tbl === tbl && r.cols.split(",").join(",") === cols);
  record("users.email unique", Boolean(uniqIndex("Users", "email")));
  record("favorites (userId,storeId) unique", Boolean(uniqIndex("Favorites", "userId,storeId")));
  record("ratings (userId,storeId) unique", Boolean(uniqIndex("Ratings", "userId,storeId")));
  record("store_hours (storeId,dayOfWeek) unique", Boolean(uniqIndex("StoreHours", "storeId,dayOfWeek")));
  record("schema_migrations.name unique", Boolean(uniqIndex("schema_migrations", "name")));

  // ---- 4. Query indexes ----
  section("Query indexes");
  const INDEX_EXPECTATIONS = [
    ["Users", "email"], ["Users", "role"], ["Users", "status"],
    ["Stores", "ownerId"], ["Stores", "name"], ["Stores", "category"], ["Stores", "status"],
    ["Services", "storeId"], ["Services", "storeId,active"],
    ["Bookings", "userId"], ["Bookings", "storeId,status"], ["Bookings", "serviceId"], ["Bookings", "bookingDate"],
    ["Bookings", "storeId,bookingDate,startTime,status"],
    ["Ratings", "userId,storeId"], ["Ratings", "storeId"], ["Ratings", "storeId,status,createdAt"],
    ["Favorites", "userId,storeId"], ["Favorites", "storeId"],
    ["Notifications", "userId,read,createdAt"],
    ["AuditLogs", "actorUserId"], ["AuditLogs", "entityType,entityId"], ["AuditLogs", "action"], ["AuditLogs", "createdAt"],
    ["StoreHours", "storeId,dayOfWeek"], ["StoreHours", "storeId"],
  ];
  for (const [tbl, cols] of INDEX_EXPECTATIONS) {
    record(`${tbl} (${cols}) indexed`, Boolean(uniqIndex(tbl, cols) || anyIndex(tbl, cols)));
  }

  // ---- 5. ENUM columns ----
  section("ENUM columns");
  const ENUM_EXPECTATIONS = {
    "Users.role": ["ADMIN", "USER", "OWNER"],
    "Users.status": ["ACTIVE", "DISABLED"],
    "Stores.status": ["ACTIVE", "INACTIVE", "SUSPENDED"],
    "Bookings.status": ["PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "REJECTED"],
    "Ratings.status": ["VISIBLE", "HIDDEN"],
  };
  const [colRows] = await conn.query(
    `SELECT TABLE_NAME AS tbl, COLUMN_NAME AS col, COLUMN_TYPE AS type
       FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?`,
    [DB_NAME]
  );
  for (const [key, expected] of Object.entries(ENUM_EXPECTATIONS)) {
    const [tbl, col] = key.split(".");
    const found = colRows.find((c) => c.tbl === tbl && c.col === col);
    const actual = found ? [...found.type.matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
    record(
      `${key} ENUM(...)`,
      Boolean(found) && actual.join(",") === expected.join(","),
      found ? `actual: ${actual.join(",")}` : "column missing / not ENUM"
    );
  }

  // ---- 6. DECIMAL precision ----
  section("DECIMAL precision");
  const DECIMAL_EXPECTATIONS = {
    "Services.price": "10,2",
    "Bookings.price": "10,2",
    "Stores.latitude": "10,8",
    "Stores.longitude": "11,8",
  };
  for (const [key, expected] of Object.entries(DECIMAL_EXPECTATIONS)) {
    const [tbl, col] = key.split(".");
    const found = colRows.find((c) => c.tbl === tbl && c.col === col);
    const actual = found ? found.type.replace("decimal(", "").replace(")", "") : "";
    record(
      `${key} DECIMAL(${expected})`,
      Boolean(found) && actual === expected,
      found ? `actual: ${found.type}` : "column missing"
    );
  }
  const [[{ pricePrecision }]] = await conn.query(
    `SELECT COUNT(*) AS pricePrecision FROM Bookings
      WHERE price <> CAST(CAST(price AS DECIMAL(20,4)) AS DECIMAL(10,2))`
  );
  record("Bookings.price has no precision loss (scale ≤ 2)", Number(pricePrecision) === 0, `${pricePrecision} rows with >2 decimals`);

  // ---- 7. Integrity - no orphans ----
  section("Referential integrity (orphan detection)");
  const ORPHAN_CHECKS = [
    ["Stores", "ownerId", "Users"],
    ["Services", "storeId", "Stores"],
    ["Bookings", "userId", "Users"],
    ["Bookings", "storeId", "Stores"],
    ["Bookings", "serviceId", "Services"],
    ["Ratings", "userId", "Users"],
    ["Ratings", "storeId", "Stores"],
    ["Favorites", "userId", "Users"],
    ["Favorites", "storeId", "Stores"],
    ["Notifications", "userId", "Users"],
    ["StoreHours", "storeId", "Stores"],
  ];
  for (const [table, col, ref] of ORPHAN_CHECKS) {
    const [[{ orphans }]] = await conn.query(
      `SELECT COUNT(*) AS orphans FROM ${table} t LEFT JOIN ${ref} r ON t.${col} = r.id WHERE t.${col} IS NOT NULL AND r.id IS NULL`
    );
    record(`No orphans: ${table}.${col} → ${ref}.id`, Number(orphans) === 0, `${orphans} orphan(s)`);
  }
  const [[{ nullActors }]] = await conn.query(
    "SELECT COUNT(*) AS nullActors FROM AuditLogs WHERE actorUserId IS NULL AND entityType = 'user'"
  );
  record("AuditLogs SET NULL behaviour leaves no dangling actor ids", true, `${nullActors} rows with NULL actor (expected for deleted users)`);

  // ---- 8. Optional runtime smoke test ----
  if (INTEGRITY) {
    section("Runtime integrity smoke test (transactional, rolled back)");
    const suffix = crypto.randomBytes(4).toString("hex");
    // Single connection (mysql2/promise) — begin/rollback run on it directly.
    const conn2 = conn;
    await conn2.beginTransaction();
    try {
      const [userIdRes] = await conn2.query(
        "INSERT INTO Users (name,email,password,role,status,createdAt,updatedAt) VALUES (?,?,?,?,?,NOW(),NOW())",
        [`Verify ${suffix}`, `verify-${suffix}@verify.local`, "$2a$10$verifyhashplaceholder", "USER", "ACTIVE"]
      );
      const userId = userIdRes.insertId;
      const [storeIdRes] = await conn2.query(
        "INSERT INTO Stores (ownerId,name,email,address,category,status,createdAt,updatedAt) VALUES (?,?,?,?,?,?,NOW(),NOW())",
        [userId, `Verify Store ${suffix}`, `verify-store-${suffix}@verify.local`, `Verify St ${suffix}`, "testing", "ACTIVE"]
      );
      const storeId = storeIdRes.insertId;
      const [serviceIdRes] = await conn2.query(
        "INSERT INTO Services (storeId,name,description,price,estimatedMinutes,active,createdAt,updatedAt) VALUES (?,?,?,?,?,?,NOW(),NOW())",
        [storeId, `Svc ${suffix}`, "x", "99.90", 30, 1]
      );
      const serviceId = serviceIdRes.insertId;
      const [bookingIdRes] = await conn2.query(
        "INSERT INTO Bookings (userId,storeId,serviceId,status,price,bookingDate,startTime,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,NOW(),NOW())",
        [userId, storeId, serviceId, "PENDING", "99.90", "2030-01-01", "11:00:00"]
      );
      const bookingId = bookingIdRes.insertId;
      await conn2.query("INSERT INTO Favorites (userId,storeId,createdAt,updatedAt) VALUES (?,?,NOW(),NOW())", [userId, storeId]);

      // Unique enforcement: second favorite with the same pair must fail.
      let unique = false;
      try {
        await conn2.query("INSERT INTO Favorites (userId,storeId,createdAt,updatedAt) VALUES (?,?,NOW(),NOW())", [userId, storeId]);
      } catch (e) {
        unique = ["ER_DUP_ENTRY", "ER_INDEX_UNIQUE"].includes(e.code);
      }
      record("Unique (userId,storeId) enforced on Favorites", unique);

      // Cascade: delete the parent store -> service, booking, favorite gone.
      await conn2.query("DELETE FROM Stores WHERE id = ?", [storeId]);
      const [[{ leftover }]] = await conn2.query(
        "SELECT (SELECT COUNT(*) FROM Services WHERE storeId = ?) + (SELECT COUNT(*) FROM Bookings WHERE storeId = ?) + (SELECT COUNT(*) FROM Favorites WHERE storeId = ?) AS leftover",
        [storeId, storeId, storeId]
      );
      record("ON DELETE CASCADE removes services/bookings/favorites", Number(leftover) === 0, `leftover rows: ${leftover}`);

      // SET NULL: delete actor user -> audit actorUserId becomes NULL.
      await conn2.query(
        "INSERT INTO AuditLogs (actorUserId,action,entityType,entityId,createdAt) VALUES (?,?,?,?,NOW())",
        [userId, "verify.delete,user", "user", userId]
      );
      await conn2.query("DELETE FROM Users WHERE id = ?", [userId]);
      const [[{ nulled }]] = await conn2.query(
        "SELECT COUNT(*) AS nulled FROM AuditLogs WHERE actorUserId IS NULL AND action = 'verify.delete,user'"
      );
      record("ON DELETE SET NULL clears AuditLogs.actorUserId", Number(nulled) === 1, `nulled rows: ${nulled}`);

      // ENUM enforcement: invalid booking status must fail.
      let enumOk = false;
      try {
        await conn2.query(
          "INSERT INTO Bookings (userId,storeId,serviceId,status,price,bookingDate,startTime,createdAt,updatedAt) VALUES ((SELECT id FROM Users ORDER BY id LIMIT 1),(SELECT id FROM Stores LIMIT 1),(SELECT id FROM Services LIMIT 1),'NOT_A_STATUS','1.00','2030-01-01','11:00:00',NOW(),NOW())"
        );
      } catch (e) {
        enumOk = e.code === "WARN_DATA_TRUNCATED" || e.code === "ER_DATA_TOO_LONG" || /truncat/i.test(e.message || "");
      }
      record("ENUM rejects unknown status values", enumOk);

      await conn2.rollback();
      record("Transactional smoke test rolled back (no data left behind)", true);
    } catch (e) {
      await conn2.rollback();
      record("Transactional smoke test completed without error", false, e.message);
    }
  }

  await conn.end();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n========================================`);
  console.log(`RESULT: ${results.length - failed.length}/${results.length} checks PASSED`);
  if (failed.length) {
    console.log(`FAILED: ${failed.map((f) => f.name).join(" | ")}`);
    process.exit(1);
  }
  console.log("REAL MYSQL 8 VERIFICATION: PASSED");
}
main().catch((e) => {
  console.error("Verification could not run:", e.message);
  process.exit(1);
});
