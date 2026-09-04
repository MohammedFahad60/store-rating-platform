/**
 * End-to-end verification of the complete platform workflow.
 *
 * Default (test-only): a throwaway SQLite database.
 *
 * Real-MySQL mode: export DB_DIALECT=mysql plus DB_HOST/DB_PORT/DB_NAME/
 * DB_USER/DB_PASSWORD. The suite then RE-CREATES that database from scratch
 * (the name MUST end in _e2e or _test), applies the tracked migrations via
 * the real server, seeds it, and runs the full HTTP flow against MySQL.
 *
 * Full chain exercised both ways: HTTP -> routes -> auth middleware ->
 * role middleware -> controllers -> Sequelize -> database -> response.
 *
 * Usage: npm run test:e2e   (from Backend/, SQLite test-only)
 *        DB_DIALECT=mysql DB_NAME=store_rating_e2e ... npm run test:e2e
 */
const { spawn, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");

const BACKEND_DIR = path.resolve(__dirname, "..");
const DB_FILE = path.join(BACKEND_DIR, ".tmp-e2e.sqlite");
const PORT = 5099;
const BASE = `http://127.0.0.1:${PORT}/api`;

// MySQL mode: export DB_DIALECT=mysql plus DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD.
// The suite RE-CREATES the database, so DB_NAME MUST end in `_e2e` or `_test`
// (a guard against wiping anything other than a dedicated test database).
const USE_MYSQL = String(process.env.DB_DIALECT || "").toLowerCase() === "mysql";
const MYSQL_E2E_NAME = USE_MYSQL ? String(process.env.DB_NAME || "") : "";

if (USE_MYSQL && !/(^|_)(e2e|test)$/.test(MYSQL_E2E_NAME)) {
  console.error(
    `[E2E] Refusing to run against "${MYSQL_E2E_NAME}": MySQL mode re-creates the database, ` +
      "so DB_NAME must end in _e2e or _test."
  );
  process.exit(2);
}

const ENV = {
  ...process.env,
  NODE_ENV: "test",
  JWT_SECRET: "e2e-test-secret-please-change",
  PORT: String(PORT),
  ...(USE_MYSQL ? {} : { DB_DIALECT: "sqlite", DB_STORAGE: DB_FILE }),
};

let failures = 0;

function check(name, condition, extra) {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${extra ? `  (${extra})` : ""}`);
  }
}

function isoOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function request(method, urlPath, { token, body, raw = false, headers = {} } = {}) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { status: res.status, data };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(child) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("Server process exited before becoming ready");
    }
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await wait(200);
  }
  throw new Error("Server did not become ready in time");
}

async function login(email, password) {
  const res = await request("POST", "/auth/login", { body: { email, password } });
  return { status: res.status, token: res.data?.token, role: res.data?.role, data: res.data };
}

async function main() {
  if (USE_MYSQL) {
    // Recreate a CLEAN test database (name is guarded above). The seed below
    // then repopulates it deterministically.
    console.log(`[E2E] MySQL mode: recreating database "${MYSQL_E2E_NAME}" on ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}`);
    const mysql = require("mysql2/promise");
    const admin = await mysql.createConnection({
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || "",
    });
    await admin.query(`DROP DATABASE IF EXISTS \`${MYSQL_E2E_NAME}\``);
    await admin.query(
      `CREATE DATABASE \`${MYSQL_E2E_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await admin.end();
  } else if (fs.existsSync(DB_FILE)) {
    fs.unlinkSync(DB_FILE);
  }

  console.log("\n==============================================");
  console.log("  STORE Platform - End-to-End Verification");
  console.log(
    USE_MYSQL
      ? `  Database: MySQL @ ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}/${MYSQL_E2E_NAME}`
      : "  Database: SQLite (test-only)"
  );
  console.log("==============================================\n");

  // 1. Start the API server (syncs schema) on a throwaway SQLite db
  const server = spawn(process.execPath, ["server.js"], {
    cwd: BACKEND_DIR,
    env: ENV,
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
  server.stderr.on("data", (d) => process.stderr.write(`[server:err] ${d}`));

  await waitForServer(server);

  // 2. Seed the demo data
  const seed = spawnSync(process.execPath, ["seed.js"], {
    cwd: BACKEND_DIR,
    env: ENV,
    encoding: "utf8",
  });

  if (seed.status !== 0) {
    console.error(seed.stdout);
    console.error(seed.stderr);
    throw new Error("Seeding failed");
  }

  // The server boot AND the seed both ran the migration runner. A third run
  // must be a no-op with a green status - proving idempotency/reproducibility.
  const migrateStatus = spawnSync(process.execPath, ["scripts/migrate.js", "--status"], {
    cwd: BACKEND_DIR,
    env: ENV,
    encoding: "utf8",
  });
  check(
    "Migration runner is idempotent (no pending migrations)",
    migrateStatus.status === 0 && /Schema is up to date/i.test(migrateStatus.stdout),
    migrateStatus.stdout?.split("\n").slice(-3).join(" | ")
  );

  console.log("\n--- Authentication & role authorization ---\n");

  const adminLogin = await login("admin@storerating.com", "Admin@123");
  check("Admin login returns ADMIN role", adminLogin.status === 200 && adminLogin.role === "ADMIN");

  const ownerLogin = await login("owner1@storerating.com", "Owner@123");
  check("Owner login returns OWNER role", ownerLogin.status === 200 && ownerLogin.role === "OWNER");

  const customerLogin = await login("aisha@gmail.com", "User@123");
  check("Customer login returns USER role", customerLogin.status === 200 && customerLogin.role === "USER");

  const badLogin = await login("aisha@gmail.com", "wrong-password-1");
  check("Invalid login rejected (401)", badLogin.status === 401);

  const noToken = await request("GET", "/stores");
  check("Missing token rejected (401)", noToken.status === 401);

  const userOnOwnerRoute = await request("GET", "/owner/dashboard", { token: customerLogin.token });
  check("USER blocked from OWNER route (403)", userOnOwnerRoute.status === 403);

  const poojaLogin = await login("pooja@gmail.com", "User@123");
  check("Second customer login works", poojaLogin.status === 200 && poojaLogin.role === "USER");

  const customerToken = customerLogin.token;
  const poojaToken = poojaLogin.token;
  const ownerToken = ownerLogin.token;
  const adminToken = adminLogin.token;

  console.log("\n--- Owner service management (root cause scenario) ---\n");

  const myStoreRes = await request("GET", "/services/my-store", { token: ownerToken });
  check("GET /services/my-store returns store + services", myStoreRes.status === 200 && myStoreRes.data?.store?.id && Array.isArray(myStoreRes.data?.services));
  const store = myStoreRes.data.store;
  const storeId = store.id;
  const seedServiceCount = myStoreRes.data.services.length;
  check("Owner has seeded services", seedServiceCount >= 4);
  check("Response shape: store.name present", Boolean(store.name));

  const createRes = await request("POST", "/services", {
    token: ownerToken,
    body: {
      name: "Windshield Polish",
      description: "Full windshield polish treatment",
      price: 350,
      estimatedMinutes: 45,
    },
  });
  check("Owner creates service (201)", createRes.status === 201, JSON.stringify(createRes.data));
  const newServiceId = createRes.data?.service?.id;
  check("Created service has an id", Number.isInteger(newServiceId));

  // reload (refresh) semantics: fetch list again and confirm the service is there
  const afterCreate = await request("GET", "/services/my-store", { token: ownerToken });
  check("After refresh the new service is visible", afterCreate.data?.services?.some((s) => s.id === newServiceId));
  check("Created service is ACTIVE", afterCreate.data?.services?.find((s) => s.id === newServiceId)?.active === true);

  // no storeId was sent - backend derived it from the JWT
  check("New service attached to owner's store", afterCreate.data?.services?.find((s) => s.id === newServiceId)?.storeId === storeId);

  const editRes = await request("PUT", `/services/${newServiceId}`, {
    token: ownerToken,
    body: { name: "Windshield Polish Pro", price: 450 },
  });
  check("Owner edits service (200)", editRes.status === 200);

  const afterEdit = await request("GET", "/services/my-store", { token: ownerToken });
  const edited = afterEdit.data?.services?.find((s) => s.id === newServiceId);
  check("After refresh edited values persist", edited?.name === "Windshield Polish Pro" && Number(edited?.price) === 450);

  const deactivateRes = await request("DELETE", `/services/${newServiceId}`, { token: ownerToken });
  check("Owner deactivates service (200)", deactivateRes.status === 200, JSON.stringify(deactivateRes.data));

  const afterDeactivate = await request("GET", "/services/my-store", { token: ownerToken });
  const deactivated = afterDeactivate.data?.services?.find((s) => s.id === newServiceId);
  check("After refresh service remains inactive", deactivated?.active === false);

  const reactivateRes = await request("PUT", `/services/${newServiceId}`, {
    token: ownerToken,
    body: { active: true },
  });
  check("Owner reactivates service (200)", reactivateRes.status === 200);

  // an OWNER cannot modify another owner's store
  const owner2Login = await login("owner2@storerating.com", "Owner@123");
  const foreignEdit = await request("PUT", `/services/${newServiceId}`, {
    token: owner2Login.token,
    body: { price: 1 },
  });
  check("Owner cannot edit another owner's service (404)", foreignEdit.status === 404);

  const otherOwnerCreate = await request("POST", "/services", {
    token: owner2Login.token,
    body: { name: "Battery Health Check", price: 200, estimatedMinutes: 30 },
  });
  check("Second owner can create their own service (201)", otherOwnerCreate.status === 201);
  const otherOwnerStore = await request("GET", "/services/my-store", { token: owner2Login.token });
  check("Second owner's service went to their own store", otherOwnerStore.data?.services?.some((s) => s.id === otherOwnerCreate.data?.service?.id) && otherOwnerStore.data?.store?.id !== storeId);

  console.log("\n--- Customer discovery & store detail ---\n");

  const discovery = await request("GET", `/stores?search=${encodeURIComponent("Glow")}&limit=5`, { token: customerToken });
  check("Store discovery returns paginated data", discovery.status === 200 && Array.isArray(discovery.data?.data) && discovery.data?.pagination?.total >= 1);
  const foundStore = discovery.data?.data?.find((s) => s.id === storeId);
  check("Store appears with averageRating", Boolean(foundStore) && foundStore.averageRating !== undefined);

  const storeDetail = await request("GET", `/stores/${storeId}`, { token: customerToken });
  check("Store detail returns metadata", storeDetail.status === 200 && storeDetail.data?.store?.name === store.name);

  const publicServices = await request("GET", `/services/store/${storeId}`, { token: customerToken });
  check("Customer sees store services", publicServices.status === 200 && publicServices.data?.services?.length > 0);
  const activeServices = publicServices.data.services;
  check("Customer only sees active services", activeServices.every((s) => s.active === true));
  check("Reactivated service visible to customers", activeServices.some((s) => s.id === newServiceId));

  console.log("\n--- Booking lifecycle ---\n");

  const targetService = activeServices[0];

  // Pooja has no rating for Glow yet - use her for the full booking -> rating journey.
  const bookRes = await request("POST", "/bookings", {
    token: poojaToken,
    body: { serviceId: targetService.id, bookingDate: isoOffset(3), startTime: "10:00", notes: "Demo booking" },
  });
  check("Customer creates booking (201 PENDING)", bookRes.status === 201 && bookRes.data?.booking?.status === "PENDING", JSON.stringify(bookRes.data));
  const bookingId = bookRes.data?.booking?.id;

  const dupRes = await request("POST", "/bookings", {
    token: poojaToken,
    body: { serviceId: targetService.id, bookingDate: isoOffset(3), startTime: "10:00" },
  });
  check("Duplicate active booking rejected (409)", dupRes.status === 409);

  const pastRes = await request("POST", "/bookings", {
    token: poojaToken,
    body: { serviceId: targetService.id, bookingDate: isoOffset(-5), startTime: "10:00" },
  });
  check("Past booking date rejected (400)", pastRes.status === 400);

  // customer cancel flow on a separate booking
  const cancelMe = await request("POST", "/bookings", {
    token: poojaToken,
    body: { serviceId: targetService.id, bookingDate: isoOffset(4), startTime: "11:00" },
  });
  const cancelRes = await request("PUT", `/bookings/${cancelMe.data?.booking?.id}/cancel`, { token: poojaToken });
  check("Customer cancels pending booking", cancelRes.status === 200 && cancelRes.data?.booking?.status === "CANCELLED");

  // owner sees the pending booking for their store
  const ownerBookings = await request("GET", `/bookings/store?status=PENDING`, { token: ownerToken });
  check("Owner sees pending store bookings", ownerBookings.status === 200 && ownerBookings.data?.bookings?.some((b) => b.id === bookingId));
  check("Owner booking includes customer name", ownerBookings.data?.bookings?.find((b) => b.id === bookingId)?.customerName === "Pooja Singh");

  // owner advances the booking: PENDING -> CONFIRMED -> IN_PROGRESS -> COMPLETED
  const confirmRes = await request("PUT", `/bookings/${bookingId}/status`, { token: ownerToken, body: { status: "CONFIRMED" } });
  check("Owner confirms booking", confirmRes.status === 200 && confirmRes.data?.booking?.status === "CONFIRMED");

  const inProgressRes = await request("PUT", `/bookings/${bookingId}/status`, { token: ownerToken, body: { status: "IN_PROGRESS" } });
  check("Owner starts booking (IN_PROGRESS)", inProgressRes.status === 200);

  const completedRes = await request("PUT", `/bookings/${bookingId}/status`, { token: ownerToken, body: { status: "COMPLETED" } });
  check("Owner completes booking", completedRes.status === 200 && completedRes.data?.booking?.status === "COMPLETED");

  const invalidTransition = await request("PUT", `/bookings/${bookingId}/status`, { token: ownerToken, body: { status: "CONFIRMED" } });
  check("Illegal transition rejected (400)", invalidTransition.status === 400);

  const foreignOwner = await request("PUT", `/bookings/${bookingId}/status`, { token: owner2Login.token, body: { status: "CANCELLED" } });
  check("Other owner cannot touch this booking (404)", foreignOwner.status === 404);

  // customer sees the updated status
  const myBookings = await request("GET", "/bookings/my", { token: poojaToken });
  const seenBooking = myBookings.data?.bookings?.find((b) => b.id === bookingId);
  check("Customer sees COMPLETED status", seenBooking?.status === "COMPLETED");
  check("Customer booking shows store + service names", seenBooking?.storeName && seenBooking?.serviceName);

  console.log("\n--- Ratings & reviews ---\n");

  // rating requires a completed booking at that store - Pooja now has one at Glow
  const rateRes = await request("POST", "/ratings", {
    token: poojaToken,
    body: { storeId, rating: 5, comment: "Great service through the app" },
  });
  check("Customer rates store after completed booking (201)", rateRes.status === 201, JSON.stringify(rateRes.data));

  const rateAgain = await request("POST", "/ratings", {
    token: poojaToken,
    body: { storeId, rating: 3 },
  });
  check("Duplicate rating rejected (409)", rateAgain.status === 409);

  // Pooja has seeded completed bookings at several stores, so pick a store
  // where she genuinely has no completed visit -> rating must be rejected (403).
  const poojaHistory = await request("GET", "/bookings/my?limit=50", { token: poojaToken });
  const poojaCompletedStoreIds = new Set(
    poojaHistory.data.bookings.filter((b) => b.status === "COMPLETED").map((b) => b.storeId)
  );
  const allStores = (await request("GET", "/stores?limit=50", { token: poojaToken })).data.data;
  const foreignStore = allStores.find((s) => !poojaCompletedStoreIds.has(s.id));
  check(
    "Found a store Pooja has never completed a visit at",
    Boolean(foreignStore),
    `completedIds=${[...poojaCompletedStoreIds].join(",")}`
  );
  const noVisitRate = await request("POST", "/ratings", {
    token: poojaToken,
    body: { storeId: foreignStore.id, rating: 4 },
  });
  check("Rating without a completed visit rejected (403)", noVisitRate.status === 403);

  const storeRatings = await request("GET", `/ratings/store/${storeId}`, { token: customerToken });
  const distSum = Object.values(storeRatings.data?.distribution || {}).reduce((a, b) => a + b, 0);
  check("Store rating summary consistent", storeRatings.status === 200 && storeRatings.data?.totalRatings === distSum && storeRatings.data?.ratings?.length > 0);
  check("New review appears in list", storeRatings.data?.ratings?.some((r) => r.comment === "Great service through the app"));

  console.log("\n--- Dashboards ---\n");

  const ownerDash = await request("GET", "/owner/dashboard", { token: ownerToken });
  check("Owner dashboard returns stats", ownerDash.status === 200 && ownerDash.data?.store?.id === storeId);
  check("Owner dashboard tracks completed bookings", ownerDash.data?.stats?.completedBookings >= 4);
  check("Owner dashboard reports revenue", Number(ownerDash.data?.stats?.revenue) > 0);
  check("Owner dashboard shows avg rating", Number(ownerDash.data?.stats?.averageRating) >= 4);

  const adminDash = await request("GET", "/admin/dashboard", { token: adminToken });
  check("Admin dashboard totals present", adminDash.status === 200 && adminDash.data?.totalUsers >= 15 && adminDash.data?.totalStores >= 6);
  check("Admin dashboard includes services/bookings", adminDash.data?.totalServices > 0 && adminDash.data?.totalBookings > 0);

  const adminStores = await request("GET", "/admin/stores", { token: adminToken });
  check("Admin store list shows owner + rating", adminStores.status === 200 && adminStores.data?.stores?.some((s) => s.id === storeId && s.ownerName === "Rahul Sharma"));

  const suspendRes = await request("PUT", `/admin/stores/${storeId}/status`, { token: adminToken, body: { status: "SUSPENDED" } });
  check("Admin suspends store", suspendRes.status === 200);

  const suspendedHidden = await request("GET", "/stores?limit=50", { token: customerToken });
  check("Suspended store hidden from discovery", !suspendedHidden.data?.data?.some((s) => s.id === storeId));

  const reactivateStoreRes = await request("PUT", `/admin/stores/${storeId}/status`, { token: adminToken, body: { status: "ACTIVE" } });
  check("Admin reactivates store", reactivateStoreRes.status === 200);

  console.log("\n--- Phase 3: favorites ---\n");

  // The seed may already favorite a store for this demo customer - start clean.
  const preFav = await request("GET", `/favorites/${foreignStore.id}/status`, { token: customerToken });
  if (preFav.data?.isFavorite) {
    await request("DELETE", `/favorites/${foreignStore.id}`, { token: customerToken });
  }
  const favAdd = await request("POST", "/favorites", { token: customerToken, body: { storeId: foreignStore.id } });
  check("Customer adds favorite (201)", favAdd.status === 201 && favAdd.data?.favorite?.storeId === foreignStore.id, JSON.stringify(favAdd.data));

  const favDup = await request("POST", "/favorites", { token: customerToken, body: { storeId: foreignStore.id } });
  check("Duplicate favorite is idempotent (200)", favDup.status === 200);

  const favList = await request("GET", "/favorites", { token: customerToken });
  check("Favorites list includes the store", favList.status === 200 && favList.data?.favorites?.some((f) => f.storeId === foreignStore.id));

  const favStatus = await request("GET", `/favorites/${foreignStore.id}/status`, { token: customerToken });
  check("Favorite status endpoint reports true", favStatus.status === 200 && favStatus.data?.isFavorite === true);

  const favCrossRemove = await request("DELETE", `/favorites/${foreignStore.id}`, { token: poojaToken });
  check("Another user cannot remove your favorite (404)", favCrossRemove.status === 404);

  const ownerFav = await request("GET", "/favorites", { token: ownerToken });
  check("OWNER blocked from favorites (403)", ownerFav.status === 403);

  const favRemove = await request("DELETE", `/favorites/${foreignStore.id}`, { token: customerToken });
  check("Customer removes favorite (200)", favRemove.status === 200);
  const favRemoveAgain = await request("DELETE", `/favorites/${foreignStore.id}`, { token: customerToken });
  check("Removing a missing favorite returns 404", favRemoveAgain.status === 404);

  console.log("\n--- Phase 3: notifications ---\n");

  const myNotifs = await request("GET", "/notifications", { token: ownerToken });
  check("Notifications list is paginated", myNotifs.status === 200 && Array.isArray(myNotifs.data?.notifications) && myNotifs.data?.pagination?.total >= 1);
  check("Owner received booking-created notification", myNotifs.data?.notifications?.some((n) => n.type === "BOOKING_CREATED" || n.title === "New booking request"));
  check("Notification response never leaks other users", myNotifs.data?.notifications?.every((n) => n.userId === undefined));

  const unreadBefore = (await request("GET", "/notifications/unread-count", { token: ownerToken })).data?.unreadCount;
  check("Unread count endpoint returns a number", typeof unreadBefore === "number" && unreadBefore >= 0);

  const targetNotif = myNotifs.data.notifications.find((n) => !n.read) || myNotifs.data.notifications[0];
  const crossRead = await request("PUT", `/notifications/${targetNotif.id}/read`, { token: customerToken });
  check("Cross-user mark-read rejected (404)", crossRead.status === 404);
  const ownRead = await request("PUT", `/notifications/${targetNotif.id}/read`, { token: ownerToken });
  check("Owner marks own notification read (200)", ownRead.status === 200 && ownRead.data?.unreadCount === Math.max(0, unreadBefore - 1), JSON.stringify(ownRead.data));

  const markAll = await request("PUT", "/notifications/read-all", { token: ownerToken });
  check("Mark-all-read sets unread to 0", markAll.status === 200 && markAll.data?.unreadCount === 0);

  console.log("\n--- Phase 3: operating hours & availability ---\n");

  const daysUntilSunday = ((0 - new Date().getDay()) + 7) % 7 || 7;
  const nextSunday = isoOffset(daysUntilSunday);
  const daysUntilMonday = ((1 - new Date().getDay()) + 7) % 7 || 7;
  const nextMonday = isoOffset(daysUntilMonday + 7); // always well in the future

  const sundayAvail = await request("GET", `/stores/${storeId}/availability?date=${nextSunday}`, { token: customerToken });
  check("Closed day returns no slots", sundayAvail.status === 200 && sundayAvail.data?.hours?.closed === true && sundayAvail.data?.slots?.length === 0);

  const weekdayAvail = await request("GET", `/stores/${storeId}/availability?date=${nextMonday}`, { token: customerToken });
  check("Open day returns 30-min slots", weekdayAvail.status === 200 && weekdayAvail.data?.slots?.length > 0 && /^\d{2}:\d{2}$/.test(weekdayAvail.data.slots[0].time) && typeof weekdayAvail.data.slots[0].available === "boolean");

  const outsideHours = await request("POST", "/bookings", {
    token: poojaToken,
    body: { serviceId: targetService.id, bookingDate: nextMonday, startTime: "07:00" },
  });
  check("Booking outside opening hours rejected (400)", outsideHours.status === 400, JSON.stringify(outsideHours.data));

  const closedDayBook = await request("POST", "/bookings", {
    token: poojaToken,
    body: { serviceId: targetService.id, bookingDate: nextSunday, startTime: "12:00" },
  });
  check("Booking on a closed day rejected (400)", closedDayBook.status === 400);

  const fullWeek = (mondayOpen, mondayClose) => [
    { dayOfWeek: 1, openTime: mondayOpen, closeTime: mondayClose, closed: false },
    { dayOfWeek: 2, openTime: "09:00", closeTime: "20:00", closed: false },
    { dayOfWeek: 3, openTime: "09:00", closeTime: "20:00", closed: false },
    { dayOfWeek: 4, openTime: "09:00", closeTime: "20:00", closed: false },
    { dayOfWeek: 5, openTime: "09:00", closeTime: "20:00", closed: false },
    { dayOfWeek: 6, openTime: "10:00", closeTime: "18:00", closed: false },
    { dayOfWeek: 7, openTime: null, closeTime: null, closed: true },
  ];

  const badHours = await request("PUT", "/owner/store/hours", {
    token: ownerToken,
    body: { hours: fullWeek("18:00", "09:00") },
  });
  check("Invalid hours (close before open) rejected (400)", badHours.status === 400, JSON.stringify(badHours.data));

  const badWeek = await request("PUT", "/owner/store/hours", {
    token: ownerToken,
    body: { hours: [{ dayOfWeek: 1, openTime: "09:00", closeTime: "20:00", closed: false }] },
  });
  check("Partial week hours rejected (400)", badWeek.status === 400);

  const goodHours = await request("PUT", "/owner/store/hours", {
    token: ownerToken,
    body: { hours: fullWeek("08:30", "21:00") },
  });
  check("Valid weekday hours accepted (200)", goodHours.status === 200 && goodHours.data?.operatingHours?.some((h) => h.dayOfWeek === 1 && h.openTime?.startsWith("08:30")));

  const hoursPersist = await request("GET", "/owner/store", { token: ownerToken });
  check("Hours persist after update", hoursPersist.data?.store?.operatingHours?.some((h) => h.dayOfWeek === 1 && h.openTime?.startsWith("08:30")));

  const restoreHours = await request("PUT", "/owner/store/hours", {
    token: ownerToken,
    body: { hours: fullWeek("09:00", "20:00") },
  });
  check("Hours restored for deterministic re-runs", restoreHours.status === 200);

  console.log("\n--- Phase 3: service detail & price snapshot ---\n");

  const serviceDetail = await request("GET", `/services/${targetService.id}`, { token: customerToken });
  check("Service detail returns service + store", serviceDetail.status === 200 && serviceDetail.data?.service?.store?.id === storeId && Number(serviceDetail.data?.service?.price) === Number(targetService.price));

  const snapshotPrice = Number(targetService.price);
  const snapshotBook = await request("POST", "/bookings", {
    token: customerToken,
    body: { serviceId: targetService.id, bookingDate: nextMonday, startTime: "09:00" },
  });
  check("Price-snapshot booking created (201)", snapshotBook.status === 201, JSON.stringify(snapshotBook.data));
  const snapshotBookingId = snapshotBook.data?.booking?.id;
  check("Booking price snapshots the service price", Number(snapshotBook.data?.booking?.price) === snapshotPrice);

  const priceBump = await request("PUT", `/services/${targetService.id}`, { token: ownerToken, body: { price: snapshotPrice + 500 } });
  check("Owner price change succeeds", priceBump.status === 200);
  const snapshotDetail = await request("GET", `/bookings/${snapshotBookingId}`, { token: customerToken });
  check("Booking keeps original snapshot price after price change", Number(snapshotDetail.data?.booking?.price) === snapshotPrice);
  const priceRestore = await request("PUT", `/services/${targetService.id}`, { token: ownerToken, body: { price: snapshotPrice } });
  check("Service price restored for deterministic re-runs", priceRestore.status === 200);

  console.log("\n--- Phase 3: booking details (role-aware) ---\n");

  const ownDetail = await request("GET", `/bookings/${bookingId}`, { token: poojaToken });
  check("Customer views own booking detail", ownDetail.status === 200 && ownDetail.data?.booking?.id === bookingId && ownDetail.data?.booking?.store?.name);
  const crossDetail = await request("GET", `/bookings/${bookingId}`, { token: customerToken });
  check("Other customer cannot view booking (404)", crossDetail.status === 404);
  const ownerDetail = await request("GET", `/bookings/${bookingId}`, { token: ownerToken });
  check("Store owner can view booking with customer info", ownerDetail.status === 200 && ownerDetail.data?.booking?.customer?.email === "pooja@gmail.com");
  const foreignOwnerDetail = await request("GET", `/bookings/${bookingId}`, { token: owner2Login.token });
  check("Other owner cannot view booking (404)", foreignOwnerDetail.status === 404);
  const completeCancel = await request("PUT", `/bookings/${bookingId}/cancel`, { token: poojaToken });
  check("Non-pending booking cannot be cancelled (400)", completeCancel.status === 400, JSON.stringify(completeCancel.data));
  const completeRetro = await request("PUT", `/bookings/${bookingId}/status`, { token: ownerToken, body: { status: "CANCELLED" } });
  check("COMPLETED booking cannot be transitioned (400)", completeRetro.status === 400);

  console.log("\n--- Phase 3: search & discovery filters ---\n");

  const svcSearch = await request("GET", `/stores?service=${encodeURIComponent("Haircut")}&limit=10`, { token: customerToken });
  check("Service-name search works", svcSearch.status === 200 && svcSearch.data?.pagination?.total >= 1);

  const priceFilter = await request("GET", "/stores?maxPrice=100&limit=10", { token: customerToken });
  check("Price filter returns only in-range stores", priceFilter.status === 200 && priceFilter.data?.data?.every((st) => st.minPrice == null || Number(st.minPrice) <= 100));

  const openNow = await request("GET", "/stores?openNow=true&limit=10", { token: customerToken });
  check("Open-now filter accepted", openNow.status === 200 && openNow.data?.filters?.openNow === true);

  const nameSort = await request("GET", "/stores?sort=name&order=asc&limit=20", { token: customerToken });
  const names = (nameSort.data?.data || []).map((st) => st.name);
  check("Name sorting works", nameSort.status === 200 && names.every((n, i) => i === 0 || names[i - 1].toLowerCase() <= n.toLowerCase()));

  const catFilter = await request("GET", "/stores?category=AUTO%20CARE&limit=20", { token: customerToken });
  check("Category filter works", catFilter.status === 200 && catFilter.data?.data?.every((st) => st.category === "AUTO CARE"));

  const minRatingFilter = await request("GET", "/stores?minRating=4.5&limit=20", { token: customerToken });
  check("Minimum-rating filter works", minRatingFilter.status === 200 && minRatingFilter.data?.data?.every((st) => Number(st.averageRating) >= 4.5));

  const weirdPage = await request("GET", "/stores?page=abc&limit=999", { token: customerToken });
  check("Bad pagination params are sanitized (no 500)", weirdPage.status === 200);

  console.log("\n--- Phase 3: owner customers (own store only) ---\n");

  const newCus = await request("POST", "/auth/register", {
    body: { name: "Phase3 Customer", email: "phase3cus@test.com", password: "User@123", address: "Test Lane" },
  });
  check("Extra customer registered for isolation test", newCus.status === 201 && newCus.data?.user?.role === "USER");
  const newCusToken = newCus.data?.token || (await login("phase3cus@test.com", "User@123")).token;

  const otherStore = otherOwnerStore.data.store;
  const otherService = otherOwnerStore.data.services.find((sv) => sv.active) || otherOwnerStore.data.services[0];
  const isoBook = await request("POST", "/bookings", {
    token: newCusToken,
    body: { serviceId: otherService.id, bookingDate: nextMonday, startTime: "09:00" },
  });
  check("Isolation customer books at second owner's store", isoBook.status === 201, JSON.stringify(isoBook.data));

  const ownerCustomers = await request("GET", "/owner/customers?limit=50", { token: ownerToken });
  const customerNames = (ownerCustomers.data?.customers || []).map((c) => c.email);
  check("Owner customers list is paginated and scoped", ownerCustomers.status === 200 && ownerCustomers.data?.pagination?.total >= 1);
  check("Owner sees own-store customers (Pooja)", customerNames.includes("pooja@gmail.com"));
  check("Owner does NOT see unrelated-store customer", !customerNames.includes("phase3cus@test.com"));

  const crossCustomer = await request("GET", `/owner/customers/${newCus.data?.user?.id}`, { token: ownerToken });
  check("Cross-owner customer id rejected (404)", crossCustomer.status === 404);

  const otherOwnerCustomers = await request("GET", "/owner/customers?limit=50", { token: owner2Login.token });
  check("Second owner sees their own new customer", (otherOwnerCustomers.data?.customers || []).some((c) => c.email === "phase3cus@test.com"));

  const owner2Bookings = await request("GET", "/owner/customers?limit=50", { token: owner2Login.token });
  check("Second owner customer list paginated", owner2Bookings.status === 200 && owner2Bookings.data?.pagination?.total >= 1);

  const owner2Search = await request("GET", `/bookings/store?search=${encodeURIComponent("phase3cus@test.com")}&limit=10`, { token: owner2Login.token });
  check("Owner booking search matches across all pages", owner2Search.status === 200 && owner2Search.data?.bookings?.some((b) => b.customerEmail === "phase3cus@test.com") && owner2Search.data?.pagination?.total >= 1, JSON.stringify(owner2Search.data));

  const custDetail = await request("GET", `/owner/customers/${newCus.data?.user?.id}`, { token: owner2Login.token });
  check("Owner customer detail shows only this store's history", custDetail.status === 200 && custDetail.data?.customer?.bookingHistory?.some((b) => b.serviceName === otherService.name));
  console.log("\n--- Phase 3: analytics (server-side aggregation) ---\n");

  const ownerAnalytics = await request("GET", "/owner/analytics?range=7", { token: ownerToken });
  const oa = ownerAnalytics.data || {};
  check("Owner analytics returns metrics", ownerAnalytics.status === 200 && typeof oa.metrics?.revenue === "number" && typeof oa.metrics?.bookings === "number");
  check("Owner analytics series are arrays", Array.isArray(oa.series?.bookings) && Array.isArray(oa.series?.revenue));
  check("Owner analytics include status distribution + top services", Boolean(oa.bookingStatusDistribution) && Array.isArray(oa.topServices));
  check("Owner analytics respect range", ownerAnalytics.status === 200 && oa.range === "7");

  const adminAnalytics = await request("GET", "/admin/analytics?range=30", { token: adminToken });
  const aa = adminAnalytics.data || {};
  check("Admin analytics returns metrics", adminAnalytics.status === 200 && aa.metrics?.totalUsers >= 15 && aa.metrics?.totalStores >= 6);
  check("Admin analytics charts are arrays", Array.isArray(aa.series?.bookings) && Array.isArray(aa.series?.users) && Array.isArray(aa.series?.stores));
  check("Admin analytics include top stores", Array.isArray(aa.topStores) && aa.topStores.length > 0);

  const custOnOwnerAnalytics = await request("GET", "/owner/analytics", { token: customerToken });
  check("USER blocked from owner analytics (403)", custOnOwnerAnalytics.status === 403);
  const ownerOnAdminAnalytics = await request("GET", "/admin/analytics", { token: ownerToken });
  check("OWNER blocked from admin analytics (403)", ownerOnAdminAnalytics.status === 403);

  console.log("\n--- Phase 3: admin review moderation ---\n");

  const adminReviews = await request("GET", "/admin/reviews?limit=50", { token: adminToken });
  const poojaReview = (adminReviews.data?.reviews || []).find((r) => r.comment === "Great service through the app");
  check("Admin review list is filterable/paginated", adminReviews.status === 200 && Boolean(poojaReview));

  const hideReview = await request("PUT", `/admin/reviews/${poojaReview.id}/status`, { token: adminToken, body: { status: "HIDDEN" } });
  check("Admin hides review (200)", hideReview.status === 200 && hideReview.data?.review?.status === "HIDDEN");

  const hiddenFromStore = await request("GET", `/ratings/store/${storeId}`, { token: customerToken });
  check("Hidden review disappears from store ratings", !(hiddenFromStore.data?.ratings || []).some((r) => r.id === poojaReview.id));

  const restoreReview = await request("PUT", `/admin/reviews/${poojaReview.id}/status`, { token: adminToken, body: { status: "VISIBLE" } });
  check("Admin restores review (200)", restoreReview.status === 200 && restoreReview.data?.review?.status === "VISIBLE");

  const restoredToStore = await request("GET", `/ratings/store/${storeId}`, { token: customerToken });
  check("Restored review appears again (never hard-deleted)", restoredToStore.data?.ratings?.some((r) => r.id === poojaReview.id));

  const userModerate = await request("PUT", `/admin/reviews/${poojaReview.id}/status`, { token: customerToken, body: { status: "HIDDEN" } });
  check("USER cannot moderate reviews (403)", userModerate.status === 403);
  const ownerModerate = await request("PUT", `/admin/reviews/${poojaReview.id}/status`, { token: ownerToken, body: { status: "HIDDEN" } });
  check("OWNER cannot moderate reviews (403)", ownerModerate.status === 403);

  const ratingUpdate = await request("PUT", `/ratings/${poojaReview.id}`, { token: poojaToken, body: { comment: "Updated review text" } });
  check("Review owner can edit own review (200)", ratingUpdate.status === 200 && ratingUpdate.data?.rating?.comment === "Updated review text");
  const ratingUpdateCross = await request("PUT", `/ratings/${poojaReview.id}`, { token: customerToken, body: { rating: 1 } });
  check("Another user cannot edit your review (404)", ratingUpdateCross.status === 404);

  const ownerReply = await request("PUT", `/ratings/${poojaReview.id}/reply`, { token: ownerToken, body: { reply: "Thank you for your feedback!" } });
  check("Store owner replies to review (200)", ownerReply.status === 200 && ownerReply.data?.rating?.ownerReply === "Thank you for your feedback!");
  const foreignReply = await request("PUT", `/ratings/${poojaReview.id}/reply`, { token: owner2Login.token, body: { reply: "spam" } });
  check("Other owner cannot reply to review (404)", foreignReply.status === 404);

  console.log("\n--- Phase 3: admin user management ---\n");

  const adminCreate = await request("POST", "/admin/users", {
    token: adminToken,
    body: { name: "Managed User", email: "managed@test.com", password: "Manage@123", role: "USER" },
  });
  check("Admin creates user (201)", adminCreate.status === 201 && adminCreate.data?.user?.role === "USER");
  check("Admin create response has no password hash", adminCreate.data?.user?.password === undefined);

  const managedLogin = await login("managed@test.com", "Manage@123");
  check("Managed user can log in", managedLogin.status === 200 && Boolean(managedLogin.token));

  const disableUser = await request("PUT", `/admin/users/${adminCreate.data?.user?.id}/status`, { token: adminToken, body: { status: "DISABLED" } });
  check("Admin disables account (200)", disableUser.status === 200 && disableUser.data?.user?.status === "DISABLED");

  const disabledTokenUse = await request("GET", "/stores", { token: managedLogin.token });
  check("Disabled account token rejected (401)", disabledTokenUse.status === 401);
  const disabledLogin = await login("managed@test.com", "Manage@123");
  check("Disabled account cannot log in (403)", disabledLogin.status === 403);

  const enableUser = await request("PUT", `/admin/users/${adminCreate.data?.user?.id}/status`, { token: adminToken, body: { status: "ACTIVE" } });
  check("Admin reactivates account (200)", enableUser.status === 200 && enableUser.data?.user?.status === "ACTIVE");
  const reEnabledLogin = await login("managed@test.com", "Manage@123");
  check("Re-activated account can log in", reEnabledLogin.status === 200);

  const ownerRoleFilter = await request("GET", "/admin/users?role=OWNER&limit=50", { token: adminToken });
  check("Admin role filter works", ownerRoleFilter.status === 200 && ownerRoleFilter.data?.users?.length > 0 && ownerRoleFilter.data?.users?.every((u) => u.role === "OWNER"));

  check("Admin user list never exposes hashes (Phase 3)", (await request("GET", "/admin/users?limit=50", { token: adminToken })).data?.users?.every((u) => u.password === undefined));

  console.log("\n--- Phase 3: customer dashboard & profile ---\n");

  const dashboard = await request("GET", "/customer/dashboard", { token: customerToken });
  const dash = dashboard.data || {};
  check("Customer dashboard returns stats", dashboard.status === 200 && typeof dash.stats?.upcomingBookings === "number" && typeof dash.stats?.averageRatingGiven === "number");
  check("Customer dashboard lists upcoming bookings", Array.isArray(dash.upcoming) && Array.isArray(dash.favoriteStores) && Array.isArray(dash.recommendedStores));

  const profileUpdate = await request("PUT", "/users/profile", {
    token: customerToken,
    body: { phone: "+919812345678", address: "New address 42" },
  });
  check("Customer updates profile (200)", profileUpdate.status === 200 && profileUpdate.data?.user?.phone === "+919812345678");

  const tamperProfile = await request("PUT", "/users/profile", {
    token: customerToken,
    body: { id: 1, role: "ADMIN", tokenVersion: 99, name: "Aisha Patel" },
  });
  const tampered = tamperProfile.data?.user || {};
  check("Profile update ignores id/role/tokenVersion", tamperProfile.status === 200 && tampered.role === "USER" && tampered.tokenVersion === undefined);

  const badPhone = await request("PUT", "/users/profile", { token: customerToken, body: { phone: "12345" } });
  check("Invalid phone rejected (400)", badPhone.status === 400);

  console.log("\n--- Phase 3: store settings rules ---\n");

  const badStoreEmail = await request("PUT", "/owner/store", { token: ownerToken, body: { email: "not-an-email" } });
  check("Invalid store email rejected (400)", badStoreEmail.status === 400);

  const storeUpdate = await request("PUT", "/owner/store", { token: ownerToken, body: { name: "Glow Auto Care Renewed", ownerId: 1 } });
  check("Owner updates store details (200)", storeUpdate.status === 200 && storeUpdate.data?.store?.name === "Glow Auto Care Renewed");
  check("Owner cannot modify ownerId (not exposed)", storeUpdate.data?.store?.ownerId === undefined);

  const settingsPersist = await request("GET", "/owner/store", { token: ownerToken });
  check("Store settings persist", settingsPersist.data?.store?.name === "Glow Auto Care Renewed" && settingsPersist.data?.store?.ownerId === undefined);

  const selfSuspend = await request("PUT", "/owner/store", { token: ownerToken, body: { status: "SUSPENDED" } });
  check("Owner cannot override admin suspension (status ignored)", selfSuspend.status === 200 && selfSuspend.data?.store?.status === "ACTIVE");

  console.log("\n--- Phase 3: admin bookings & audit logs ---\n");

  const adminBookings = await request("GET", "/admin/bookings?limit=50", { token: adminToken });
  check("Admin bookings list is paginated", adminBookings.status === 200 && adminBookings.data?.pagination?.total >= 1 && adminBookings.data?.bookings?.length > 0);
  const adminPending = await request("GET", "/admin/bookings?status=PENDING&limit=50", { token: adminToken });
  check("Admin booking status filter works", adminPending.status === 200 && adminPending.data?.bookings?.every((b) => b.status === "PENDING"));
  const adminSearch = await request("GET", `/admin/bookings?search=${encodeURIComponent("Glow")}&limit=10`, { token: adminToken });
  check("Admin booking search matches across all pages", adminSearch.status === 200 && adminSearch.data?.bookings?.every((b) => b.storeName.includes("Glow")) && adminSearch.data?.pagination?.total >= 1, JSON.stringify(adminSearch.data));

  const userOnAdminBookings = await request("GET", "/admin/bookings", { token: customerToken });
  check("USER blocked from admin bookings (403)", userOnAdminBookings.status === 403);

  const audit = await request("GET", "/admin/audit-logs?limit=100", { token: adminToken });
  const logs = audit.data?.logs || [];
  const logActions = logs.map((l) => l.action);
  check("Audit log records booking status changes", logActions.includes("booking.status"));
  check("Audit log records store suspension", logActions.includes("store.status"));
  check("Audit log records review moderation", logActions.includes("rating.moderate"));
  check("Audit log records user creation", logActions.includes("user.create"));
  const secretLeak = logs.some((l) => {
    const meta = JSON.stringify(l.metadata || {});
    return /eyJ/i.test(meta) || /"password"/i.test(meta) || /"token"/i.test(meta) || /"jwt"/i.test(meta);
  });
  check("Audit metadata never stores passwords or JWTs", !secretLeak);

  const auditFilter = await request("GET", "/admin/audit-logs?action=booking.status&limit=100", { token: adminToken });
  check("Audit action filter works", auditFilter.status === 200 && auditFilter.data?.logs?.every((l) => l.action === "booking.status"));

  const firstActor = logs[0]?.actorUserId;
  const auditActor = await request("GET", `/admin/audit-logs?actorId=${firstActor}&limit=100`, { token: adminToken });
  check("Audit actor filter works", auditActor.status === 200 && auditActor.data?.logs?.every((l) => l.actorUserId === firstActor));

  const userOnAudit = await request("GET", "/admin/audit-logs", { token: customerToken });
  check("USER blocked from audit logs (403)", userOnAudit.status === 403);

  console.log("\n--- Contract & security checks ---\n");

  const profile = await request("GET", "/users/profile", { token: customerToken });
  check("Profile endpoint returns safe user", profile.status === 200 && profile.data?.user?.email === "aisha@gmail.com" && profile.data?.user?.password === undefined);

  const adminUsers = await request("GET", "/admin/users", { token: adminToken });
  check("Admin user list never leaks password hashes", adminUsers.status === 200 && adminUsers.data?.users?.every((u) => u.password === undefined));

  const ownerCreateRating = await request("POST", "/ratings", { token: ownerToken, body: { storeId: foreignStore.id, rating: 5 } });
  check("OWNER cannot submit ratings (403)", ownerCreateRating.status === 403);

  const weakPw = await request("POST", "/auth/register", {
    body: { name: "Weak Password User", email: "weak@test.com", password: "short", address: "x" },
  });
  check("Weak password rejected on register", weakPw.status === 400);

  console.log("\n--- Health, API contract & security hardening ---\n");

  // Health endpoint (public) - simple 200 + database status, no internals
  const health = await request("GET", "/health", { headers: { Authorization: "" } });
  check("Health endpoint returns ok (200)", health.status === 200 && health.data?.success === true && health.data?.status === "ok");
  check("Health endpoint reports DB connected, no secrets leaked", health.data?.database === "connected" && JSON.stringify(health.data).includes("host") === false);

  // Error contract: success:false everywhere, JSON only
  const missingTokenShape = await request("GET", "/stores");
  check("Missing token returns contract shape (401 success:false)", missingTokenShape.status === 401 && missingTokenShape.data?.success === false && Boolean(missingTokenShape.data?.message));
  const malformedAuth = await request("GET", "/stores", { headers: { Authorization: "Basic dXNlcjpwYXNz" } });
  check("Malformed Authorization scheme rejected (401)", malformedAuth.status === 401 && malformedAuth.data?.success === false);
  const badHeaderToken = await request("GET", "/stores", { headers: { Authorization: "Bearer" } });
  check("Bearer without token rejected (401)", badHeaderToken.status === 401);

  const tamperedToken = jwt.sign({ id: 1, role: "ADMIN", tv: 0 }, "wrong-secret-zz", { expiresIn: "1h" });
  const tamperedRes = await request("GET", "/admin/dashboard", { token: tamperedToken });
  check("Token signed with wrong secret rejected (401)", tamperedRes.status === 401);

  const expiredToken = jwt.sign(
    { id: 1, role: "USER", tv: 0 },
    ENV.JWT_SECRET,
    { expiresIn: "-10s" }
  );
  const expiredRes = await request("GET", "/stores", { token: expiredToken });
  check("Expired token rejected (401)", expiredRes.status === 401);

  const actorMissing = jwt.sign({ id: 999999, role: "ADMIN", tv: 0 }, ENV.JWT_SECRET, { expiresIn: "1h" });
  const actorMissingRes = await request("GET", "/admin/dashboard", { token: actorMissing });
  check("Token for deleted user rejected (401)", actorMissingRes.status === 401);

  const unknownRoute = await request("GET", "/does-not-exist", { token: adminToken });
  check("Unknown route returns 404 JSON contract", unknownRoute.status === 404 && unknownRoute.data?.success === false);

  const invalidJson = await request("POST", "/auth/login", {
    raw: true,
    body: '{"email": "aisha@gmail.com", "password": "x"',
  });
  check("Invalid JSON payload rejected (400)", invalidJson.status === 400 && invalidJson.data?.success === false);

  const userOnAdminRoute = await request("GET", "/admin/dashboard", { token: customerToken });
  check("USER blocked from ADMIN dashboard (403)", userOnAdminRoute.status === 403 && userOnAdminRoute.data?.success === false);
  const userOnAdminUsers = await request("GET", "/admin/users", { token: customerToken });
  check("USER blocked from admin user management (403)", userOnAdminUsers.status === 403);

  // IDOR protection: customer A cannot cancel customer B's booking
  const aishaPending = await request("POST", "/bookings", {
    token: customerToken,
    body: { serviceId: targetService.id, bookingDate: isoOffset(6), startTime: "10:30" },
  });
  check("Aisha creates a fresh pending booking", aishaPending.status === 201);
  const rohanLogin = await login("rohan@gmail.com", "User@123");
  const crossCancel = await request("PUT", `/bookings/${aishaPending.data?.booking?.id}/cancel`, { token: rohanLogin.token });
  check("Customer cannot cancel another customer's booking (404)", crossCancel.status === 404);

  // Validation: invalid rating value must be rejected before any business rules
  const invalidRating = await request("POST", "/ratings", {
    token: customerToken,
    body: { storeId, rating: 6 },
  });
  check("Out-of-range rating rejected (400)", invalidRating.status === 400);

  // Role cannot be escalated through the public register endpoint
  const escalate = await request("POST", "/auth/register", {
    body: { name: "Escalation Attempt", email: "escalate@test.com", password: "Escalate@1", role: "ADMIN" },
  });
  check("Register ignores supplied role (USER forced)", escalate.status === 201 && escalate.data?.user?.role === "USER");

  // Invalid email / weak validation
  const badEmail = await request("POST", "/auth/register", {
    body: { name: "Bad Email", email: "not-an-email", password: "Valid@123" },
  });
  check("Invalid email rejected on register (400)", badEmail.status === 400);

  // ==================================================================
  // Password-change token invalidation (MUST be last: it invalidates
  // all previously issued tokens for this user).
  // ==================================================================
  const poojaBefore = await login("pooja@gmail.com", "User@123");
  check("Pre-change Pooja login works", poojaBefore.status === 200);
  const changeRes = await request("PUT", "/auth/change-password", {
    token: poojaBefore.token,
    body: { oldPassword: "User@123", newPassword: "NewPass@1" },
  });
  check("Password change succeeds (200)", changeRes.status === 200);

  const oldTokenAfterChange = await request("GET", "/users/profile", { token: poojaBefore.token });
  check("OLD token invalidated after password change (401)", oldTokenAfterChange.status === 401 && oldTokenAfterChange.data?.success === false);

  const newLogin = await login("pooja@gmail.com", "NewPass@1");
  check("Login with NEW password works", newLogin.status === 200 && Boolean(newLogin.token));
  const oldLogin = await login("pooja@gmail.com", "User@123");
  check("Login with OLD password fails (401)", oldLogin.status === 401);

  // Restore the documented demo password so re-runs stay deterministic
  const restoreRes = await request("PUT", "/auth/change-password", {
    token: newLogin.token,
    body: { oldPassword: "NewPass@1", newPassword: "User@123" },
  });
  check("Demo password restored for deterministic re-runs", restoreRes.status === 200);
  const restoredLogin = await login("pooja@gmail.com", "User@123");
  check("Restored demo credentials work again", restoredLogin.status === 200);

  console.log("\n==============================================");
  if (failures === 0) {
    console.log("  ALL CHECKS PASSED ✔");
  } else {
    console.log(`  ${failures} CHECK(S) FAILED ✘`);
  }
  console.log("==============================================\n");

  server.kill();
  // Wait for the child to fully exit before removing the database - on
  // Windows the handle may still be open briefly after kill() returns.
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    server.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  await cleanup();
  process.exit(failures === 0 ? 0 : 1);
}

async function cleanup() {
  try {
    if (USE_MYSQL) {
      const mysql = require("mysql2/promise");
      const admin = await mysql.createConnection({
        host: process.env.DB_HOST || "127.0.0.1",
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD || "",
      });
      await admin.query(`DROP DATABASE IF EXISTS \`${MYSQL_E2E_NAME}\``);
      await admin.end();
    } else if (fs.existsSync(DB_FILE)) {
      fs.unlinkSync(DB_FILE);
    }
  } catch {
    // Best-effort cleanup only.
  }
}

main().catch(async (err) => {
  console.error("[e2e] Error:", err.message);
  await cleanup();
  process.exit(1);
});
