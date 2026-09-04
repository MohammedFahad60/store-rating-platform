const { Op, fn, col, literal, where } = require("sequelize");
const { sequelize, Store, Service, Booking, Rating, User } = require("../models");
const { ApiError } = require("../utils/http");
const { parseRange } = require("../utils/validators");
const { findOwnerStore } = require("../utils/ownerStore");

const TERMINAL = ["COMPLETED", "CANCELLED", "REJECTED"];

/** Start date (YYYY-MM-DD) for a range, relative to today. */
function rangeStart(range) {
  const d = new Date();
  d.setDate(d.getDate() - (range.days - 1));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Bucket series by day. Each bucket: { date, count, revenue }. */
async function dailySeries(model, whereClause, dateCol = "createdAt", revenueCol = null) {
  const rows = await sequelize.query(
    `SELECT DATE(${dateCol}) AS day, COUNT(*) AS count ${
      revenueCol ? `, COALESCE(SUM(${revenueCol}), 0) AS revenue` : ""
    } FROM ${model.getTableName()} WHERE ${whereClause} GROUP BY DATE(${dateCol}) ORDER BY day ASC`,
    { type: sequelize.QueryTypes.SELECT }
  );
  return rows.map((r) => ({
    date: String(r.day || "").slice(0, 10),
    count: Number(r.count || 0),
    revenue: revenueCol ? Number(Number(r.revenue || 0).toFixed(2)) : undefined,
  }));
}

// ==========================================
// OWNER ANALYTICS
// GET /api/owner/analytics?range=7|30|90|today
// ==========================================
exports.ownerAnalytics = async (req, res) => {
  const store = await findOwnerStore(req.user.id);
  if (!store) throw new ApiError(404, "No store is assigned to your owner account");

  const range = parseRange(req.query.range);
  const from = rangeStart(range);

  const storeId = store.id;

  const [revenueRow, customerCount, avgRow, ratingCount, serviceStats] = await Promise.all([
    sequelize.query(
      `SELECT COALESCE(SUM(price), 0) AS revenue FROM Bookings WHERE storeId = ? AND status = 'COMPLETED' AND bookingDate >= ?`,
      { replacements: [storeId, from], type: sequelize.QueryTypes.SELECT }
    ),
    Booking.count({
      where: { storeId, createdAt: { [Op.gte]: new Date(`${from}T00:00:00`) } },
      col: "userId",
      distinct: true,
    }),
    sequelize.query(
      `SELECT AVG(rating) AS avg FROM Ratings WHERE storeId = ? AND status = 'VISIBLE'`,
      { replacements: [storeId], type: sequelize.QueryTypes.SELECT }
    ),
    Rating.count({ where: { storeId, status: "VISIBLE" } }),
    Service.findAll({ where: { storeId }, attributes: ["id", "name", "active"] }),
  ]);

  const bookingsSeries = await dailySeries(
    Booking,
    `storeId = ${storeId} AND createdAt >= '${from}'`
  );

  const bookingsRevenueSeries = await dailySeries(
    Booking,
    `storeId = ${storeId} AND status = 'COMPLETED' AND createdAt >= '${from}'`,
    "createdAt",
    "price"
  );

  const statusRows = await sequelize.query(
    `SELECT status, COUNT(*) AS count FROM Bookings WHERE storeId = ? AND bookingDate >= ? GROUP BY status`,
    { replacements: [storeId, from], type: sequelize.QueryTypes.SELECT }
  );

  const ratingRows = await sequelize.query(
    `SELECT rating, COUNT(*) AS count FROM Ratings WHERE storeId = ? AND status = 'VISIBLE' GROUP BY rating`,
    { replacements: [storeId], type: sequelize.QueryTypes.SELECT }
  );

  const topServices = await sequelize.query(
    `SELECT s.id, s.name, COUNT(b.id) AS bookings, COALESCE(SUM(b.price), 0) AS revenue
     FROM Services s
     LEFT JOIN Bookings b ON b.serviceId = s.id AND b.storeId = ? AND b.status = 'COMPLETED'
     WHERE s.storeId = ?
     GROUP BY s.id, s.name
     ORDER BY bookings DESC, revenue DESC
     LIMIT 5`,
    { replacements: [storeId, storeId], type: sequelize.QueryTypes.SELECT }
  );

  const distribution = { PENDING: 0, CONFIRMED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0, REJECTED: 0 };
  for (const row of statusRows) distribution[row.status] = Number(row.count || 0);

  const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of ratingRows) ratingDistribution[Number(row.rating)] = Number(row.count || 0);

  res.json({
    success: true,
    range: range.range,
    store: { id: store.id, name: store.name },
    metrics: {
      revenue: Number(Number(revenueRow[0]?.revenue || 0).toFixed(2)),
      customers: Number(customerCount),
      bookings: distribution.PENDING + distribution.CONFIRMED + distribution.IN_PROGRESS
        + distribution.COMPLETED + distribution.CANCELLED + distribution.REJECTED,
      bookingsCompleted: distribution.COMPLETED,
      bookingsCancelled: distribution.CANCELLED,
      activeServices: serviceStats.filter((s) => s.active).length,
      totalServices: serviceStats.length,
      averageRating: avgRow[0]?.avg != null ? Number(Number(avgRow[0].avg).toFixed(1)) : 0,
      totalRatings: ratingCount,
    },
    series: {
      bookings: bookingsSeries,
      revenue: bookingsRevenueSeries,
    },
    bookingStatusDistribution: distribution,
    ratingDistribution,
    topServices: topServices.map((s) => ({
      id: Number(s.id),
      name: s.name,
      bookings: Number(s.bookings || 0),
      revenue: Number(Number(s.revenue || 0).toFixed(2)),
    })),
  });
};

// ==========================================
// ADMIN ANALYTICS
// GET /api/admin/analytics?range=7|30|90
// ==========================================
exports.adminAnalytics = async (req, res) => {
  const range = parseRange(req.query.range);
  const from = rangeStart(range);

  const [totalUsers, totalOwners, totalCustomers, totalStores, activeStores, inactiveStores,
    totalServices, totalBookings, revenueRow, avgRow, totalRatings] = await Promise.all([
    User.count(),
    User.count({ where: { role: "OWNER" } }),
    User.count({ where: { role: "USER" } }),
    Store.count(),
    Store.count({ where: { status: "ACTIVE" } }),
    Store.count({ where: { status: { [Op.ne]: "ACTIVE" } } }),
    Service.count(),
    Booking.count(),
    sequelize.query(
      `SELECT COALESCE(SUM(price), 0) AS revenue FROM Bookings WHERE status = 'COMPLETED' AND bookingDate >= ?`,
      { replacements: [from], type: sequelize.QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT AVG(rating) AS avg FROM Ratings WHERE status = 'VISIBLE'`,
      { type: sequelize.QueryTypes.SELECT }
    ),
    Rating.count({ where: { status: "VISIBLE" } }),
  ]);

  const bookingsSeries = await dailySeries(Booking, `createdAt >= '${from}'`);
  const revenueSeries = await dailySeries(
    Booking,
    `status = 'COMPLETED' AND createdAt >= '${from}'`,
    "createdAt",
    "price"
  );
  const userSeries = await dailySeries(User, `createdAt >= '${from}'`);
  const storeSeries = await dailySeries(Store, `createdAt >= '${from}'`);

  const statusRows = await sequelize.query(
    `SELECT status, COUNT(*) AS count FROM Bookings WHERE createdAt >= ? GROUP BY status`,
    { replacements: [new Date(`${from}T00:00:00`)], type: sequelize.QueryTypes.SELECT }
  );

  const topStores = await sequelize.query(
    `SELECT s.id, s.name, COUNT(b.id) AS bookings,
            (SELECT COUNT(*) FROM Ratings r WHERE r.storeId = s.id AND r.status = 'VISIBLE') AS reviews,
            (SELECT AVG(r.rating) FROM Ratings r WHERE r.storeId = s.id AND r.status = 'VISIBLE') AS avg_rating
     FROM Stores s
     LEFT JOIN Bookings b ON b.storeId = s.id
     GROUP BY s.id, s.name
     ORDER BY bookings DESC
     LIMIT 5`,
    { type: sequelize.QueryTypes.SELECT }
  );

  const distribution = { PENDING: 0, CONFIRMED: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0, REJECTED: 0 };
  for (const row of statusRows) distribution[row.status] = Number(row.count || 0);

  res.json({
    success: true,
    range: range.range,
    metrics: {
      totalUsers,
      totalOwners,
      totalCustomers,
      totalStores,
      activeStores,
      inactiveStores,
      totalServices,
      totalBookings,
      revenue: Number(Number(revenueRow[0]?.revenue || 0).toFixed(2)),
      averageRating: avgRow[0]?.avg != null ? Number(Number(avgRow[0].avg).toFixed(1)) : 0,
      totalRatings,
    },
    series: {
      bookings: bookingsSeries,
      revenue: revenueSeries,
      users: userSeries,
      stores: storeSeries,
    },
    bookingStatusDistribution: distribution,
    topStores: topStores.map((s) => ({
      id: Number(s.id),
      name: s.name,
      bookings: Number(s.bookings || 0),
      reviews: Number(s.reviews || 0),
      averageRating: s.avg_rating != null ? Number(Number(s.avg_rating).toFixed(1)) : 0,
    })),
  });
};
