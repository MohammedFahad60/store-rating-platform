const { Op, fn, col } = require("sequelize");
const { sequelize, User, Booking, Store, Service, Rating, Favorite } = require("../models");
const { ApiError } = require("../utils/http");
const { validateName, validatePhone } = require("../utils/validators");
const { serializeRating } = require("./ratingController");

// ==========================================
// CUSTOMER: dashboard
// GET /api/customer/dashboard
// ==========================================
exports.getCustomerDashboard = async (req, res) => {
  const userId = req.user.id;

  const [upcomingRows, upcomingTotal, pending, completed, cancelled, favoriteRows, ratingRows, avgGivenRow] = await Promise.all([
    Booking.findAll({
      where: { userId, status: { [Op.in]: ["CONFIRMED", "IN_PROGRESS"] }, bookingDate: { [Op.gte]: todayISO() } },
      include: [
        { model: Store, attributes: ["id", "name", "category", "address"] },
        { model: Service, attributes: ["id", "name"] },
      ],
      order: [["bookingDate", "ASC"], ["startTime", "ASC"]],
      limit: 5,
    }),
    Booking.count({
      where: { userId, status: { [Op.in]: ["CONFIRMED", "IN_PROGRESS"] }, bookingDate: { [Op.gte]: todayISO() } },
    }),
    Booking.count({ where: { userId, status: "PENDING" } }),
    Booking.count({ where: { userId, status: "COMPLETED" } }),
    Booking.count({ where: { userId, status: "CANCELLED" } }),
    Favorite.findAll({
      where: { userId },
      include: [{ model: Store, attributes: ["id", "name", "category", "address", "status"] }],
      order: [["createdAt", "DESC"]],
      limit: 5,
    }),
    Rating.findAll({ where: { userId }, order: [["createdAt", "DESC"]], limit: 5 }),
    sequelize.query(
      "SELECT AVG(rating) AS avg, COUNT(*) AS count FROM Ratings WHERE userId = ?",
      { replacements: [userId], type: sequelize.QueryTypes.SELECT }
    ),
  ]);

  const upcoming = upcomingRows;

  const recentBookingStoreIds = upcoming.map((b) => b.storeId);
  const recommendedWhere = { status: "ACTIVE" };
  if (recentBookingStoreIds.length) recommendedWhere.id = { [Op.notIn]: recentBookingStoreIds };
  const recommended = await Store.findAll({
    where: recommendedWhere,
    attributes: ["id", "name", "category", "address"],
    limit: 4,
    order: [["createdAt", "DESC"]],
  });

  res.json({
    success: true,
    stats: {
      upcomingBookings: upcomingTotal,
      pendingBookings: pending,
      completedBookings: completed,
      cancelledBookings: cancelled,
      favorites: favoriteRows.length,
      averageRatingGiven: avgGivenRow[0]?.avg != null ? Number(Number(avgGivenRow[0].avg).toFixed(1)) : null,
      totalReviews: Number(avgGivenRow[0]?.count || 0),
    },
    upcoming: upcoming.map((b) => ({
      id: b.id,
      storeId: b.storeId,
      serviceId: b.serviceId,
      storeName: b.Store?.name || "Store",
      storeCategory: b.Store?.category,
      storeAddress: b.Store?.address,
      serviceName: b.Service?.name || "Service",
      bookingDate: b.bookingDate,
      startTime: b.startTime,
      status: b.status,
      price: Number(b.price),
    })),
    favoriteStores: favoriteRows.map((f) => ({
      id: f.Store?.id,
      name: f.Store?.name,
      category: f.Store?.category,
      address: f.Store?.address,
      status: f.Store?.status,
    })),
    recommendedStores: recommended.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      address: s.address,
    })),
    recentReviews: ratingRows.map((r) => serializeRating(r, { withStore: true })),
  });
};

// ==========================================
// CUSTOMER: update own profile (name/email/phone/address)
// PUT /api/users/profile
// ==========================================
exports.updateProfile = async (req, res) => {
  const user = await User.findByPk(req.user.id);
  if (!user) throw new ApiError(404, "User not found");

  const body = req.body || {};
  const errors = [];

  const name = body.name !== undefined ? String(body.name).trim() : user.name;
  const nameErr = validateName(name);
  if (nameErr) errors.push(nameErr);

  const email = body.email !== undefined ? String(body.email).trim().toLowerCase() : user.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Email is invalid");

  const phone = body.phone !== undefined ? (body.phone ? String(body.phone).trim() : null) : user.phone;
  const phoneErr = validatePhone(phone);
  if (phoneErr) errors.push(phoneErr);

  const address = body.address !== undefined
    ? (body.address ? String(body.address).trim().slice(0, 400) : null)
    : user.address;

  if (errors.length > 0) throw new ApiError(400, errors[0], errors);

  if (email !== user.email) {
    const taken = await User.findOne({ where: { email, id: { [Op.ne]: user.id } } });
    if (taken) throw new ApiError(409, "Email is already registered");
  }

  const payload = {};
  if (body.name !== undefined) payload.name = name;
  if (body.email !== undefined) payload.email = email;
  if (body.phone !== undefined) payload.phone = phone;
  if (body.address !== undefined) payload.address = address;

  await user.update(payload);

  res.json({
    success: true,
    message: "Profile updated successfully",
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
