const { Op, fn, col } = require("sequelize");
const { sequelize, Store, Rating, Service, Booking, User, Favorite, StoreHour } = require("../models");
const { ApiError } = require("../utils/http");
const {
  parsePositiveInt,
  validateName,
  validateEmail,
  validatePhone,
  validateLat,
  validateLng,
  parsePageLimit,
  parseSortField,
  parseSortDirection,
} = require("../utils/validators");
const { findOwnerStore } = require("../utils/ownerStore");
const {
  normalizeTime,
  validateWeekdayHours,
  hoursMap,
  windowForDate,
  isOpenAt,
  buildSlots,
} = require("../utils/hours");
const { audit, ACTIONS } = require("../utils/audit");
const { notify, TYPES } = require("../utils/notify");

const STORE_SORT_FIELDS = ["newest", "name", "highest_rated", "most_reviewed", "nearest", "price"];

/** Distance (km) between a lat/lng pair - haversine. */
function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** MySQL-compatible distance literal; null on SQLite (JS fallback). */
function distanceLiteral(lat, lng) {
  if (sequelize.getDialect() !== "mysql") return null;
  return sequelize.literal(
    `(6371 * acos(cos(radians(${Number(lat)})) * cos(radians(latitude)) * cos(radians(longitude) - radians(${Number(lng)})) + sin(radians(${Number(lat)})) * sin(radians(latitude))))`
  );
}

/** Returns true when a store page row is open at "now" in its local day. */
function rowOpenNow(store, hourRowsByStore, now = new Date()) {
  const map = hoursMap(store, hourRowsByStore.get(store.id));
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return isOpenAt(map, `${y}-${m}-${d}`, time);
}

// ==========================================
// STORE DISCOVERY
// GET /api/stores
// ==========================================
exports.getStores = async (req, res) => {
  const { page, limit, offset } = parsePageLimit(req.query, { max: 50, defaultLimit: 9 });
  const search = (req.query.search || "").trim();
  const category = (req.query.category || "").trim();
  const serviceName = (req.query.service || "").trim();
  const minRating = Number(req.query.minRating);
  const maxPrice = Number(req.query.maxPrice);
  const openNow = String(req.query.openNow || "") === "true";
  const userLat = Number(req.query.lat);
  const userLng = Number(req.query.lng);
  const hasCoords = Number.isFinite(userLat) && Number.isFinite(userLng)
    && userLat >= -90 && userLat <= 90 && userLng >= -180 && userLng <= 180;
  const sort = parseSortField(req.query.sort, STORE_SORT_FIELDS, "highest_rated");
  const direction = parseSortDirection(req.query.order);

  const conditions = [{ status: "ACTIVE" }];

  if (search) {
    const like = `%${search}%`;
    conditions.push({
      [Op.or]: [
        { name: { [Op.like]: like } },
        { address: { [Op.like]: like } },
        { category: { [Op.like]: like } },
        { description: { [Op.like]: like } },
      ],
    });
  }

  if (category) conditions.push({ category });

  // Service-name search: resolve matching store ids via a parameterized
  // query (portable across SQLite/MySQL) rather than named params inside a
  // raw literal, which Sequelize does not bind.
  if (serviceName) {
    const matches = await Service.findAll({
      attributes: ["storeId"],
      where: {
        active: true,
        name: { [Op.like]: `%${serviceName}%` },
      },
      raw: true,
    });
    const ids = [...new Set(matches.map((m) => Number(m.storeId)))];
    if (ids.length === 0) conditions.push(sequelize.literal("1 = 0"));
    else conditions.push({ id: { [Op.in]: ids } });
  }

  if (Number.isFinite(minRating) && minRating >= 1 && minRating <= 5) {
    conditions.push(
      sequelize.where(
        sequelize.literal("(SELECT AVG(r.rating) FROM Ratings r WHERE r.storeId = Store.id)"),
        ">=",
        minRating
      )
    );
  }

  // Price range: a store matches if it has at least one active service in range.
  if (Number.isFinite(maxPrice) && maxPrice >= 0) {
    const matches = await Service.findAll({
      attributes: ["storeId"],
      where: {
        active: true,
        price: { [Op.lte]: maxPrice },
      },
      raw: true,
    });
    const ids = [...new Set(matches.map((m) => Number(m.storeId)))];
    if (ids.length === 0) conditions.push(sequelize.literal("1 = 0"));
    else conditions.push({ id: { [Op.in]: ids } });
  }

  const where = { [Op.and]: conditions };

  const aggregateAttributes = [
    [sequelize.literal("(SELECT AVG(r.rating) FROM Ratings r WHERE r.storeId = Store.id)"), "averageRating"],
    [sequelize.literal("(SELECT COUNT(*) FROM Ratings r WHERE r.storeId = Store.id)"), "ratingCount"],
    [sequelize.literal("(SELECT COUNT(*) FROM Services s WHERE s.storeId = Store.id AND s.active = 1)"), "serviceCount"],
    [sequelize.literal("(SELECT MIN(s.price) FROM Services s WHERE s.storeId = Store.id AND s.active = 1)"), "minPrice"],
  ];
  const distanceExpr = hasCoords ? distanceLiteral(userLat, userLng) : null;
  if (distanceExpr) aggregateAttributes.push([distanceExpr, "distance"]);

  const orderMap = {
    highest_rated: [[sequelize.literal("averageRating"), "DESC"]],
    most_reviewed: [[sequelize.literal("ratingCount"), "DESC"]],
    newest: [["createdAt", "DESC"]],
    name: [["name", direction]],
    price: [[sequelize.literal("minPrice"), direction]],
    nearest: distanceExpr ? [[sequelize.literal("distance"), "ASC"]] : [["createdAt", "DESC"]],
  };
  const order = orderMap[sort];

  const [total, rawRows] = await Promise.all([
    Store.count({ where }),
    Store.findAll({
      where,
      attributes: { include: aggregateAttributes },
      order,
      limit,
      offset,
    }),
  ]);

  // Open-now filtering (needs per-store hours; applied in app so it behaves
  // identically on MySQL 8 and the SQLite test dialect).
  let rows = rawRows;
  if (openNow) {
    const ids = rawRows.map((s) => s.id);
    const hourRows = ids.length
      ? await StoreHour.findAll({ where: { storeId: { [Op.in]: ids } } })
      : [];
    const byStore = new Map();
    for (const h of hourRows) {
      if (!byStore.has(h.storeId)) byStore.set(h.storeId, []);
      byStore.get(h.storeId).push(h);
    }
    rows = rawRows.filter((s) => rowOpenNow(s, byStore));
  }

  // JS distance fallback for the SQLite test dialect (MySQL uses the literal).
  if (sort === "nearest" && hasCoords && !distanceExpr) {
    rows = [...rows]
      .map((s) => {
        const d = (s.latitude != null && s.longitude != null)
          ? haversineKm(userLat, userLng, Number(s.latitude), Number(s.longitude))
          : null;
        return { row: s, d };
      })
      .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity))
      .map((x) => x.row);
  }

  const data = rows.map((store) => ({
    id: store.id,
    name: store.name,
    category: store.category,
    address: store.address,
    phone: store.phone,
    description: store.description,
    openingTime: normalizeTime(store.openingTime),
    closingTime: normalizeTime(store.closingTime),
    latitude: store.latitude,
    longitude: store.longitude,
    averageRating: Number(store.get("averageRating") || 0).toFixed(1),
    ratingCount: Number(store.get("ratingCount") || 0),
    serviceCount: Number(store.get("serviceCount") || 0),
    minPrice: store.get("minPrice") != null ? Number(store.get("minPrice")) : null,
    distance: store.get("distance") != null ? Number(Number(store.get("distance")).toFixed(2)) : null,
  }));

  res.json({
    success: true,
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    filters: { openNow, sort, hasCoords },
  });
};

// ==========================================
// STORE DETAIL
// GET /api/stores/:id
// ==========================================
exports.getStoreById = async (req, res) => {
  const storeId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(storeId)) throw new ApiError(400, "Invalid store id");

  const store = await Store.findByPk(storeId, {
    include: [{ model: User, attributes: ["id", "name"] }],
  });
  if (!store) throw new ApiError(404, "Store not found");

  const isOwner = store.ownerId === req.user.id;
  if (store.status !== "ACTIVE" && !isOwner) {
    throw new ApiError(403, "This store is currently unavailable");
  }

  const [avgRow, serviceCountRow, activeServiceCountRow, hourRows, favorites] = await Promise.all([
    sequelize.query("SELECT AVG(rating) AS avg FROM Ratings WHERE storeId = ? AND status = 'VISIBLE'", {
      replacements: [store.id],
      type: sequelize.QueryTypes.SELECT,
    }),
    sequelize.query("SELECT COUNT(*) AS c FROM Services WHERE storeId = ?", {
      replacements: [store.id],
      type: sequelize.QueryTypes.SELECT,
    }),
    sequelize.query("SELECT COUNT(*) AS c FROM Services WHERE storeId = ? AND active = 1", {
      replacements: [store.id],
      type: sequelize.QueryTypes.SELECT,
    }),
    StoreHour.findAll({ where: { storeId: store.id } }),
    Favorite.findAll({ where: { userId: req.user.id, storeId: store.id } }),
  ]);

  const averageRating = avgRow[0]?.avg ? Number(avgRow[0].avg).toFixed(1) : "0.0";

  res.json({
    success: true,
    store: {
      id: store.id,
      name: store.name,
      email: store.email,
      phone: store.phone,
      description: store.description,
      category: store.category,
      address: store.address,
      latitude: store.latitude,
      longitude: store.longitude,
      openingTime: normalizeTime(store.openingTime),
      closingTime: normalizeTime(store.closingTime),
      status: store.status,
      ownerName: store.User?.name || null,
      averageRating,
      totalServices: Number(serviceCountRow[0]?.c || 0),
      activeServiceCount: Number(activeServiceCountRow[0]?.c || 0),
      isFavorite: favorites.length > 0,
      operatingHours: hourRows.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        openTime: normalizeTime(h.openTime),
        closeTime: normalizeTime(h.closeTime),
        closed: Boolean(h.closed),
      })),
      hasCustomHours: hourRows.length > 0,
    },
  });
};

// ==========================================
// AVAILABILITY / TIME SLOTS
// GET /api/stores/:id/availability?date=YYYY-MM-DD
// ==========================================
exports.getStoreAvailability = async (req, res) => {
  const storeId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(storeId)) throw new ApiError(400, "Invalid store id");

  const date = req.query.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
    throw new ApiError(400, "A valid date (YYYY-MM-DD) is required");
  }
  const checked = new Date(`${date}T00:00:00`);
  if (Number.isNaN(checked.getTime())) throw new ApiError(400, "Invalid date");

  const store = await Store.findByPk(storeId);
  if (!store) throw new ApiError(404, "Store not found");
  const isOwner = store.ownerId === req.user.id;
  if (store.status !== "ACTIVE" && !isOwner) {
    throw new ApiError(403, "This store is currently unavailable");
  }

  const hourRows = await StoreHour.findAll({ where: { storeId } });
  const map = hoursMap(store, hourRows);

  const booked = await Booking.findAll({
    where: {
      storeId,
      bookingDate: date,
      status: { [Op.in]: ["PENDING", "CONFIRMED", "IN_PROGRESS"] },
    },
    attributes: ["startTime"],
  });

  const { window, slots } = buildSlots(map, date, booked.map((b) => b.startTime));

  res.json({
    success: true,
    date,
    hours: window,
    slots,
  });
};

// ==========================================
// OWNER: STORE SETTINGS (GET)
// GET /api/owner/store
// ==========================================
exports.getStoreSettings = async (req, res) => {
  const store = await findOwnerStore(req.user.id);
  if (!store) throw new ApiError(404, "No store is assigned to your owner account");

  const hourRows = await StoreHour.findAll({ where: { storeId: store.id }, order: [["dayOfWeek", "ASC"]] });

  res.json({
    success: true,
    store: {
      id: store.id,
      name: store.name,
      email: store.email,
      phone: store.phone,
      description: store.description,
      category: store.category,
      address: store.address,
      latitude: store.latitude,
      longitude: store.longitude,
      openingTime: normalizeTime(store.openingTime),
      closingTime: normalizeTime(store.closingTime),
      status: store.status,
      createdAt: store.createdAt,
      operatingHours: hourRows.length
        ? hourRows.map((h) => ({
            dayOfWeek: h.dayOfWeek,
            openTime: normalizeTime(h.openTime),
            closeTime: normalizeTime(h.closeTime),
            closed: Boolean(h.closed),
          }))
        : null,
    },
  });
};

// ==========================================
// OWNER: STORE SETTINGS (UPDATE)
// PUT /api/owner/store
// ==========================================
exports.updateStoreSettings = async (req, res) => {
  const store = await findOwnerStore(req.user.id);
  if (!store) throw new ApiError(404, "No store is assigned to your owner account");

  const body = req.body || {};
  const errors = [];

  const name = body.name !== undefined ? String(body.name).trim() : store.name;
  const nameErr = validateName(name, "Store name");
  if (nameErr) errors.push(nameErr);

  const email = body.email !== undefined ? String(body.email).trim().toLowerCase() : store.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Store email is invalid");

  const phone = body.phone !== undefined ? (body.phone ? String(body.phone).trim() : null) : store.phone;
  const phoneErr = validatePhone(phone);
  if (phoneErr) errors.push(phoneErr);

  const address = body.address !== undefined ? String(body.address).trim() : store.address;
  if (!address || address.length > 400) errors.push("Address is required (max 400 characters)");

  const category = body.category !== undefined
    ? (body.category ? String(body.category).trim() : null)
    : store.category;
  if (category && category.length > 100) errors.push("Category cannot exceed 100 characters");

  const description = body.description !== undefined
    ? (body.description ? String(body.description).trim().slice(0, 2000) : null)
    : store.description;

  const latitude = body.latitude !== undefined ? body.latitude : store.latitude;
  const latErr = validateLat(latitude);
  if (latErr) errors.push(latErr);

  const longitude = body.longitude !== undefined ? body.longitude : store.longitude;
  const lngErr = validateLng(longitude);
  if (lngErr) errors.push(lngErr);

  const openingTime = body.openingTime !== undefined ? normalizeTime(body.openingTime) : normalizeTime(store.openingTime);
  const closingTime = body.closingTime !== undefined ? normalizeTime(body.closingTime) : normalizeTime(store.closingTime);
  const hasDefaultHours = body.openingTime !== undefined || body.closingTime !== undefined;
  if (hasDefaultHours) {
    if (!openingTime || !closingTime) {
      errors.push("Default opening/closing times are required (HH:MM)");
    } else if (openingTime >= closingTime) {
      errors.push("Closing time must be after opening time");
    }
  }

  if (errors.length > 0) throw new ApiError(400, errors[0], errors);

  const changed = {};
  if (body.name !== undefined) changed.name = name;
  if (body.email !== undefined) changed.email = email;
  if (body.phone !== undefined) changed.phone = phone;
  if (body.address !== undefined) changed.address = address;
  if (body.category !== undefined) changed.category = category;
  if (body.description !== undefined) changed.description = description;
  if (body.latitude !== undefined) changed.latitude = latitude === "" || latitude === null ? null : Number(latitude);
  if (body.longitude !== undefined) changed.longitude = longitude === "" || longitude === null ? null : Number(longitude);
  if (body.openingTime !== undefined) changed.openingTime = openingTime;
  if (body.closingTime !== undefined) changed.closingTime = closingTime;

  await store.update(changed);

  // Owner cannot self-suspend; only an admin may suspend a store. Allowing
  // ACTIVE/INACTIVE only keeps admin suspension authoritative.
  await audit(req, {
    action: ACTIONS.STORE_UPDATE,
    entityType: "Store",
    entityId: store.id,
    metadata: { fields: Object.keys(changed) },
  });

  res.json({
    success: true,
    message: "Store settings updated successfully",
    store: {
      id: store.id,
      name: store.name,
      email: store.email,
      phone: store.phone,
      description: store.description,
      category: store.category,
      address: store.address,
      latitude: store.latitude,
      longitude: store.longitude,
      openingTime: normalizeTime(store.openingTime),
      closingTime: normalizeTime(store.closingTime),
      status: store.status,
    },
  });
};

// ==========================================
// OWNER: OPERATING HOURS (UPDATE)
// PUT /api/owner/store/hours
// ==========================================
exports.updateStoreHours = async (req, res) => {
  const store = await findOwnerStore(req.user.id);
  if (!store) throw new ApiError(404, "No store is assigned to your owner account");

  const { errors, byDay } = validateWeekdayHours(req.body?.hours);
  if (errors.length > 0) throw new ApiError(400, errors[0], errors);

  await sequelize.transaction(async (transaction) => {
    for (const entry of byDay.values()) {
      await StoreHour.upsert(
        { storeId: store.id, ...entry },
        {
          transaction,
          conflictFields: ["storeId", "dayOfWeek"],
        }
      );
    }
  });

  await audit(req, {
    action: ACTIONS.STORE_HOURS_UPDATE,
    entityType: "Store",
    entityId: store.id,
  });

  const hourRows = await StoreHour.findAll({ where: { storeId: store.id }, order: [["dayOfWeek", "ASC"]] });
  res.json({
    success: true,
    message: "Operating hours updated successfully",
    operatingHours: hourRows.map((h) => ({
      dayOfWeek: h.dayOfWeek,
      openTime: normalizeTime(h.openTime),
      closeTime: normalizeTime(h.closeTime),
      closed: Boolean(h.closed),
    })),
  });
};

// ==========================================
// OWNER DASHBOARD (with date-range metrics)
// GET /api/owner/dashboard?range=today|7|30|90
// ==========================================
exports.ownerDashboard = async (req, res) => {
  const store = await findOwnerStore(req.user.id);
  if (!store) throw new ApiError(404, "No store is assigned to your owner account");

  const range = parseRangeValue(req.query.range);
  const from = dateNDaysAgo(range.days - 1);
  const today = dateNDaysAgo(0);

  const [
    totalServices,
    activeServices,
    totalBookings,
    pendingBookings,
    confirmedBookings,
    inProgressBookings,
    completedBookings,
    cancelledBookings,
    rejectedBookings,
    todayBookings,
    upcomingBookings,
    uniqueCustomers,
    revenueRow,
    avgRow,
    totalRatings,
    recentRatings,
    recentBookings,
  ] = await Promise.all([
    Service.count({ where: { storeId: store.id } }),
    Service.count({ where: { storeId: store.id, active: true } }),
    Booking.count({ where: { storeId: store.id } }),
    Booking.count({ where: { storeId: store.id, status: "PENDING" } }),
    Booking.count({ where: { storeId: store.id, status: "CONFIRMED" } }),
    Booking.count({ where: { storeId: store.id, status: "IN_PROGRESS" } }),
    Booking.count({ where: { storeId: store.id, status: "COMPLETED" } }),
    Booking.count({ where: { storeId: store.id, status: "CANCELLED" } }),
    Booking.count({ where: { storeId: store.id, status: "REJECTED" } }),
    Booking.count({
      where: { storeId: store.id, bookingDate: today, status: { [Op.notIn]: ["CANCELLED", "REJECTED"] } },
    }),
    Booking.count({
      where: {
        storeId: store.id,
        bookingDate: { [Op.gte]: today },
        status: { [Op.in]: ["PENDING", "CONFIRMED", "IN_PROGRESS"] },
      },
    }),
    Booking.count({
      where: { storeId: store.id, status: { [Op.ne]: "CANCELLED" } },
      col: "userId",
      distinct: true,
    }),
    sequelize.query(
      "SELECT COALESCE(SUM(price), 0) AS revenue FROM Bookings WHERE storeId = ? AND status = 'COMPLETED' AND bookingDate >= ?",
      { replacements: [store.id, from], type: sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      "SELECT AVG(rating) AS avg FROM Ratings WHERE storeId = ? AND status = 'VISIBLE'",
      { replacements: [store.id], type: sequelize.QueryTypes.SELECT }
    ),
    Rating.count({ where: { storeId: store.id, status: "VISIBLE" } }),
    Rating.findAll({
      where: { storeId: store.id, status: "VISIBLE" },
      include: [{ model: User, attributes: ["id", "name", "email"] }],
      order: [["createdAt", "DESC"]],
      limit: 6,
    }),
    Booking.findAll({
      where: { storeId: store.id },
      include: [
        { model: User, attributes: ["id", "name"] },
        { model: Service, attributes: ["id", "name"] },
      ],
      order: [["createdAt", "DESC"]],
      limit: 8,
    }),
  ]);

  const revenue = Number(revenueRow[0]?.revenue || 0);
  const averageRating = avgRow[0]?.avg ? Number(avgRow[0].avg).toFixed(1) : "0.0";

  res.json({
    success: true,
    range: range.range,
    store: {
      id: store.id,
      name: store.name,
      category: store.category,
      email: store.email,
      address: store.address,
      status: store.status,
    },
    stats: {
      totalServices,
      activeServices,
      totalBookings,
      pendingBookings,
      confirmedBookings,
      inProgressBookings,
      completedBookings,
      cancelledBookings,
      rejectedBookings,
      todayBookings,
      upcomingBookings,
      totalCustomers: uniqueCustomers,
      averageRating,
      totalRatings,
      revenue: revenue.toFixed(2),
    },
    recentRatings,
    recentBookings,
  });
};

function parseRangeValue(value) {
  const raw = String(value || "30").toLowerCase();
  if (raw === "today") return { range: "today", days: 1 };
  const days = Number.parseInt(raw, 10);
  if ([7, 30, 90].includes(days)) return { range: String(days), days };
  return { range: "30", days: 30 };
}

function dateNDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ==========================================
// OWNER: CUSTOMERS (only customers of this store)
// GET /api/owner/customers
// ==========================================
exports.getOwnerCustomers = async (req, res) => {
  const store = await findOwnerStore(req.user.id);
  if (!store) throw new ApiError(404, "No store is assigned to your owner account");

  const { page, limit, offset } = parsePageLimit(req.query, { max: 50, defaultLimit: 10 });
  const search = (req.query.search || "").trim();

  // Customers = distinct users who booked at this store.
  const where = { storeId: store.id };
  const customerIds = await Booking.findAll({
    where,
    attributes: [[fn("DISTINCT", col("userId")), "userId"]],
    raw: true,
  });
  const ids = customerIds.map((r) => Number(r.userId));
  if (ids.length === 0) {
    return res.json({ success: true, customers: [], pagination: { page, limit, total: 0, totalPages: 0 } });
  }

  const userWhere = { id: { [Op.in]: ids } };
  if (search) {
    const like = `%${search}%`;
    userWhere[Op.or] = [
      { name: { [Op.like]: like } },
      { email: { [Op.like]: like } },
      { phone: { [Op.like]: like } },
    ];
  }

  const total = await User.count({ where: userWhere });
  const customers = await User.findAll({ where: userWhere, order: [["name", "ASC"]], limit, offset });
  const pageIds = customers.map((c) => c.id);

  // Batched aggregates for THIS store only (3 queries for the whole page
  // instead of 5 per customer). All queries are grouped by userId and then
  // joined in JS, so cross-store data is never mixed in.
  const [bookingAggs, lastAggs, ratingAggs] = pageIds.length
    ? await Promise.all([
        sequelize.query(
          `SELECT userId,
                  COUNT(*) AS bookingCount,
                  COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS completedCount,
                  COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN price ELSE 0 END), 0) AS spending
           FROM Bookings WHERE storeId = :storeId AND userId IN (:ids)
           GROUP BY userId`,
          { replacements: { ids: pageIds, storeId: store.id }, type: sequelize.QueryTypes.SELECT }
        ),
        sequelize.query(
          `SELECT userId, createdAt AS lastAt, status FROM (
             SELECT userId, createdAt, status,
                    ROW_NUMBER() OVER (PARTITION BY userId ORDER BY createdAt DESC) AS rn
             FROM Bookings WHERE storeId = :storeId AND userId IN (:ids)
           ) t WHERE rn = 1`,
          { replacements: { ids: pageIds, storeId: store.id }, type: sequelize.QueryTypes.SELECT }
        ),
        sequelize.query(
          `SELECT userId, AVG(rating) AS avgRating FROM Ratings
           WHERE storeId = :storeId AND userId IN (:ids) GROUP BY userId`,
          { replacements: { ids: pageIds, storeId: store.id }, type: sequelize.QueryTypes.SELECT }
        ),
      ])
    : [[], [], []];

  const bookingById = new Map(bookingAggs.map((r) => [Number(r.userId), r]));
  const lastById = new Map(lastAggs.map((r) => [Number(r.userId), r]));
  const ratingById = new Map(ratingAggs.map((r) => [Number(r.userId), r]));

  const rows = customers.map((customer) => {
    const aggs = bookingById.get(customer.id) || {};
    const last = lastById.get(customer.id);
    const avg = ratingById.get(customer.id)?.avgRating;
    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      bookingCount: Number(aggs.bookingCount || 0),
      completedBookings: Number(aggs.completedCount || 0),
      lastBooking: last ? { at: last.lastAt, status: last.status } : null,
      totalSpending: Number(aggs.spending || 0),
      averageRatingGiven: avg != null ? Number(Number(avg).toFixed(1)) : null,
    };
  });

  res.json({
    success: true,
    customers: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
  });
};

// ==========================================
// OWNER: CUSTOMER DETAILS (own-store bookings only)
// GET /api/owner/customers/:id
// ==========================================
exports.getOwnerCustomerDetails = async (req, res) => {
  const store = await findOwnerStore(req.user.id);
  if (!store) throw new ApiError(404, "No store is assigned to your owner account");

  const customerId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(customerId)) throw new ApiError(400, "Invalid customer id");

  const customer = await User.findByPk(customerId, {
    attributes: ["id", "name", "email", "phone", "address"],
  });
  if (!customer) throw new ApiError(404, "Customer not found");

  // Privacy rule: an owner may only view customers who have actually
  // interacted with THEIR store. Cross-owner user enumeration is rejected.
  const interactionCount = await Booking.count({
    where: { storeId: store.id, userId: customerId },
  });
  if (interactionCount === 0) {
    throw new ApiError(404, "Customer not found");
  }

  const bookings = await Booking.findAll({
    where: { storeId: store.id, userId: customerId },
    include: [{ model: Service, attributes: ["id", "name", "price"] }],
    order: [["createdAt", "DESC"]],
    limit: 100,
  });

  // Ratings have no service FK; include only the review fields we expose.
  const reviews = await Rating.findAll({
    where: { storeId: store.id, userId: customerId },
    order: [["createdAt", "DESC"]],
  });

  // Only expose data from THIS store - never other stores' interactions.
  res.json({
    success: true,
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      bookingHistory: bookings.map((b) => ({
        id: b.id,
        serviceId: b.serviceId,
        serviceName: b.Service?.name || "Service",
        bookingDate: b.bookingDate,
        startTime: b.startTime,
        status: b.status,
        price: Number(b.price),
        createdAt: b.createdAt,
      })),
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        status: r.status,
        createdAt: r.createdAt,
      })),
    },
  });
};
