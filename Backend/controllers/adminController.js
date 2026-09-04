const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const { sequelize, User, Store, Service, Rating, Booking, AuditLog } = require("../models");
const { ApiError } = require("../utils/http");
const { publicUser, publicStore } = require("../utils/sanitize");
const {
  ROLES,
  STORE_STATUSES,
  BOOKING_STATUSES,
  validateName,
  validateEmail,
  validatePassword,
  validateAddress,
  validateStorePayload,
  parsePageLimit,
  parseSortField,
  parseSortDirection,
} = require("../utils/validators");
const { audit, ACTIONS } = require("../utils/audit");
const { notify, TYPES } = require("../utils/notify");

// ==========================================
// PLATFORM STATISTICS
// ==========================================
exports.getDashboard = async (req, res) => {
  const [
    totalUsers,
    totalOwners,
    totalCustomers,
    disabledUsers,
    totalStores,
    activeStores,
    suspendedStores,
    totalServices,
    totalBookings,
    pendingBookings,
    completedBookings,
    totalRatings,
    visibleRatings,
  ] = await Promise.all([
    User.count(),
    User.count({ where: { role: "OWNER" } }),
    User.count({ where: { role: "USER" } }),
    User.count({ where: { status: "DISABLED" } }),
    Store.count(),
    Store.count({ where: { status: "ACTIVE" } }),
    Store.count({ where: { status: "SUSPENDED" } }),
    Service.count(),
    Booking.count(),
    Booking.count({ where: { status: "PENDING" } }),
    Booking.count({ where: { status: "COMPLETED" } }),
    Rating.count(),
    Rating.count({ where: { status: "VISIBLE" } }),
  ]);

  res.json({
    success: true,
    totalUsers,
    totalOwners,
    totalCustomers,
    disabledUsers,
    totalStores,
    activeStores,
    suspendedStores,
    totalServices,
    totalBookings,
    pendingBookings,
    completedBookings,
    totalRatings,
    visibleRatings,
  });
};

// ==========================================
// CREATE USER (ADMIN)
// ==========================================
exports.createUser = async (req, res) => {
  const { name, email, password, address, role } = req.body || {};

  const errors = [
    validateName(name),
    validateEmail(email),
    validatePassword(password),
    validateAddress(address),
  ].filter(Boolean);

  if (!ROLES.includes(role)) {
    errors.push("Role must be one of ADMIN, OWNER, USER");
  }

  if (errors.length > 0) {
    throw new ApiError(400, errors[0], errors);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await User.findOne({ where: { email: normalizedEmail } });
  if (existingUser) {
    throw new ApiError(409, "Email is already registered");
  }

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password: await bcrypt.hash(password, 10),
    address: address ? address.trim() : null,
    role,
    status: "ACTIVE",
    passwordChangedAt: new Date(),
  });

  await audit(req, {
    action: ACTIONS.USER_CREATE,
    entityType: "User",
    entityId: user.id,
    metadata: { role },
  });

  res.status(201).json({
    success: true,
    message: "User created successfully",
    user: publicUser(user),
  });
};

// ==========================================
// LIST USERS (ADMIN) - search / role filter / sort / pagination
// ==========================================
exports.getUsers = async (req, res) => {
  const { page, limit, offset } = parsePageLimit(req.query, { max: 50, defaultLimit: 10 });
  const search = (req.query.search || "").trim();
  const role = String(req.query.role || "").toUpperCase();
  const sort = parseSortField(req.query.sort, ["created", "name", "role"], "created");
  const direction = parseSortDirection(req.query.order);

  const where = {};
  if (role && ROLES.includes(role)) where.role = role;
  if (search) {
    const like = `%${search}%`;
    where[Op.or] = [
      { name: { [Op.like]: like } },
      { email: { [Op.like]: like } },
      { phone: { [Op.like]: like } },
    ];
  }

  const orderMap = {
    created: [["createdAt", direction]],
    name: [["name", direction]],
    role: [["role", direction]],
  };

  const { count, rows } = await User.findAndCountAll({
    where,
    attributes: ["id", "name", "email", "phone", "address", "role", "status", "createdAt"],
    order: orderMap[sort],
    limit,
    offset,
    distinct: true,
  });

  res.json({
    success: true,
    users: rows.map((u) => publicUser(u)),
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 0 },
  });
};

// ==========================================
// USER DETAIL (ADMIN)
// ==========================================
exports.getUserById = async (req, res) => {
  const userId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(userId)) throw new ApiError(400, "Invalid user id");

  const user = await User.findByPk(userId, {
    attributes: ["id", "name", "email", "phone", "address", "role", "status", "createdAt"],
    include: [{ model: Store, attributes: ["id", "name", "status"] }],
  });

  if (!user) throw new ApiError(404, "User not found");

  res.json({ success: true, user });
};

// ==========================================
// UPDATE USER STATUS (ACTIVE / DISABLED) - ADMIN
// PUT /api/admin/users/:id/status
// ==========================================
exports.updateUserStatus = async (req, res) => {
  const userId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(userId)) throw new ApiError(400, "Invalid user id");

  const status = String(req.body?.status || "").toUpperCase();
  if (!["ACTIVE", "DISABLED"].includes(status)) {
    throw new ApiError(400, "Status must be one of ACTIVE, DISABLED");
  }

  const user = await User.findByPk(userId);
  if (!user) throw new ApiError(404, "User not found");

  // Prevent an admin from disabling themselves (lockout protection).
  if (user.id === req.user.id && status === "DISABLED") {
    throw new ApiError(400, "You cannot disable your own account");
  }

  // Disabling an account must invalidate its existing tokens immediately.
  const payload = { status };
  if (status === "DISABLED") {
    payload.tokenVersion = (user.tokenVersion || 0) + 1;
    payload.passwordChangedAt = new Date();
  }
  await user.update(payload);

  await audit(req, {
    action: ACTIONS.USER_STATUS,
    entityType: "User",
    entityId: user.id,
    metadata: { status },
  });

  res.json({
    success: true,
    message: `User ${status.toLowerCase()} successfully`,
    user: publicUser(user),
  });
};

// ==========================================
// CREATE STORE (ADMIN assigns an OWNER)
// ==========================================
exports.createStore = async (req, res) => {
  const { name, email, address, ownerId, category, phone, description } = req.body || {};

  const errors = validateStorePayload({ name, email, address, category, phone });

  const parsedOwnerId = Number.parseInt(ownerId, 10);
  if (!Number.isInteger(parsedOwnerId)) {
    errors.push("A valid owner id is required");
  }

  if (errors.length > 0) {
    throw new ApiError(400, errors[0], errors);
  }

  const store = await sequelize.transaction(async (transaction) => {
    const owner = await User.findByPk(parsedOwnerId, { transaction });
    if (!owner) {
      throw new ApiError(404, "Owner user not found");
    }
    if (owner.role !== "OWNER") {
      throw new ApiError(400, "The selected user is not an OWNER");
    }

    // Product rule: one managed store per owner in this version.
    const existingStore = await Store.findOne({
      where: { ownerId: parsedOwnerId },
      transaction,
    });
    if (existingStore) {
      throw new ApiError(409, "This owner already manages a store");
    }

    return Store.create(
      {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        address: address.trim(),
        phone: phone ? phone.trim() : null,
        category: category ? category.trim() : null,
        description: description ? String(description).trim() : null,
        ownerId: parsedOwnerId,
        status: "ACTIVE",
      },
      { transaction }
    );
  });

  await audit(req, {
    action: ACTIONS.STORE_CREATE,
    entityType: "Store",
    entityId: store.id,
    metadata: { ownerId: parsedOwnerId },
  });

  res.status(201).json({
    success: true,
    message: "Store created successfully",
    store,
  });
};

// ==========================================
// LIST STORES (ADMIN) - search / filter / sort / pagination
// ==========================================
exports.getStores = async (req, res) => {
  const { page, limit, offset } = parsePageLimit(req.query, { max: 50, defaultLimit: 10 });
  const search = (req.query.search || "").trim();
  const category = (req.query.category || "").trim();
  const status = String(req.query.status || "").toUpperCase();
  const sort = parseSortField(req.query.sort, ["created", "name", "status"], "created");
  const direction = parseSortDirection(req.query.order);

  const where = {};
  if (status && STORE_STATUSES.includes(status)) where.status = status;
  if (category) where.category = category;
  if (search) {
    const like = `%${search}%`;
    where[Op.or] = [
      { name: { [Op.like]: like } },
      { email: { [Op.like]: like } },
      { address: { [Op.like]: like } },
    ];
  }

  const orderMap = {
    created: [["createdAt", direction]],
    name: [["name", direction]],
    status: [["status", direction]],
  };

  const { count, rows } = await Store.findAndCountAll({
    where,
    include: [
      { model: User, attributes: ["id", "name"] },
      { model: Rating, attributes: ["rating"] },
      { model: Service, attributes: ["id", "active"] },
    ],
    order: orderMap[sort],
    limit,
    offset,
    distinct: true,
  });

  res.json({
    success: true,
    stores: rows.map((store) => {
      const ratings = store.Ratings || [];
      const averageRating = ratings.length
        ? (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1)
        : "0.0";

      return {
        id: store.id,
        name: store.name,
        email: store.email,
        phone: store.phone,
        address: store.address,
        category: store.category,
        status: store.status,
        ownerId: store.ownerId,
        ownerName: store.User?.name || "—",
        averageRating,
        ratingCount: ratings.length,
        serviceCount: (store.Services || []).length,
        activeServiceCount: (store.Services || []).filter((s) => s.active).length,
      };
    }),
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 0 },
  });
};

// ==========================================
// UPDATE STORE STATUS (ACTIVE / INACTIVE / SUSPENDED)
// ==========================================
exports.updateStoreStatus = async (req, res) => {
  const storeId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(storeId)) {
    throw new ApiError(400, "Invalid store id");
  }

  const status = String(req.body?.status || "").toUpperCase();
  if (!STORE_STATUSES.includes(status)) {
    throw new ApiError(400, "Status must be one of ACTIVE, INACTIVE, SUSPENDED");
  }

  const store = await Store.findByPk(storeId);
  if (!store) {
    throw new ApiError(404, "Store not found");
  }

  await store.update({ status });

  await audit(req, {
    action: ACTIONS.STORE_STATUS,
    entityType: "Store",
    entityId: store.id,
    metadata: { status },
  });

  // Notify the store owner of an administrative status change.
  await notify(
    store.ownerId,
    TYPES.STORE_STATUS,
    "Store status changed",
    `An administrator set your store status to ${status.toLowerCase()}.`,
    { storeId: store.id }
  ).catch(() => {});

  res.json({
    success: true,
    message: `Store ${status.toLowerCase()} successfully`,
    store,
  });
};

// ==========================================
// ADMIN: ALL BOOKINGS (view-only + filters/pagination)
// GET /api/admin/bookings
// ==========================================
exports.getAdminBookings = async (req, res) => {
  const { page, limit, offset } = parsePageLimit(req.query, { max: 50, defaultLimit: 10 });
  const search = (req.query.search || "").trim();
  const status = String(req.query.status || "").toUpperCase();
  const storeId = Number.parseInt(req.query.storeId, 10);
  const sort = parseSortField(req.query.sort, ["date", "created", "status"], "created");
  const direction = parseSortDirection(req.query.order);

  const where = {};
  if (status && BOOKING_STATUSES.includes(status)) where.status = status;
  if (Number.isInteger(storeId)) where.storeId = storeId;
  if (req.query.from && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) where.createdAt = { [Op.gte]: `${req.query.from}T00:00:00` };
  if (req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) where.createdAt = { ...(where.createdAt || {}), [Op.lte]: `${req.query.to}T23:59:59` };

  const orderMap = {
    date: [["bookingDate", direction]],
    created: [["createdAt", direction]],
    status: [["status", direction]],
  };

  // Database-level search (spans all pages) against the joined names.
  if (search) {
    const like = `%${search}%`;
    where[Op.or] = [
      { "$User.name$": { [Op.like]: like } },
      { "$User.email$": { [Op.like]: like } },
      { "$Store.name$": { [Op.like]: like } },
      { "$Service.name$": { [Op.like]: like } },
    ];
  }

  const { count, rows } = await Booking.findAndCountAll({
    where,
    include: [
      { model: User, attributes: ["id", "name", "email"], required: Boolean(search) },
      { model: Store, attributes: ["id", "name"], required: Boolean(search) },
      { model: Service, attributes: ["id", "name"], required: Boolean(search) },
    ],
    order: orderMap[sort],
    limit,
    offset,
    distinct: true,
    subQuery: false,
  });

  const bookings = rows;

  res.json({
    success: true,
    bookings: bookings.map((b) => ({
      id: b.id,
      userId: b.userId,
      storeId: b.storeId,
      serviceId: b.serviceId,
      customerName: b.User?.name || "Customer",
      customerEmail: b.User?.email,
      storeName: b.Store?.name || "Store",
      serviceName: b.Service?.name || "Service",
      bookingDate: b.bookingDate,
      startTime: b.startTime,
      status: b.status,
      price: Number(b.price),
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    })),
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 0 },
  });
};

// ==========================================
// ADMIN: REVIEWS (search / filter / pagination)
// GET /api/admin/reviews
// ==========================================
exports.getAdminReviews = async (req, res) => {
  const { page, limit, offset } = parsePageLimit(req.query, { max: 50, defaultLimit: 10 });
  const search = (req.query.search || "").trim();
  const status = String(req.query.status || "").toUpperCase();
  const rating = Number.parseInt(req.query.rating, 10);
  const storeId = Number.parseInt(req.query.storeId, 10);

  const where = {};
  if (["VISIBLE", "HIDDEN"].includes(status)) where.status = status;
  if (Number.isInteger(rating) && rating >= 1 && rating <= 5) where.rating = rating;
  if (Number.isInteger(storeId)) where.storeId = storeId;
  if (search) {
    const like = `%${search}%`;
    where[Op.or] = [{ comment: { [Op.like]: like } }, { ownerReply: { [Op.like]: like } }];
  }

  const { count, rows } = await Rating.findAndCountAll({
    where,
    include: [
      { model: User, attributes: ["id", "name", "email"] },
      { model: Store, attributes: ["id", "name"] },
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  res.json({
    success: true,
    reviews: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      storeId: r.storeId,
      userName: r.User?.name || "Customer",
      userEmail: r.User?.email,
      storeName: r.Store?.name || "Store",
      rating: r.rating,
      comment: r.comment,
      status: r.status,
      ownerReply: r.ownerReply,
      createdAt: r.createdAt,
    })),
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 0 },
  });
};

// ==========================================
// ADMIN: MODERATE REVIEW (hide / restore - never delete)
// PUT /api/admin/reviews/:id/status
// ==========================================
exports.moderateReview = async (req, res) => {
  const ratingId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(ratingId)) throw new ApiError(400, "Invalid review id");

  const status = String(req.body?.status || "").toUpperCase();
  if (!["VISIBLE", "HIDDEN"].includes(status)) {
    throw new ApiError(400, "Status must be one of VISIBLE, HIDDEN");
  }

  const rating = await Rating.findByPk(ratingId);
  if (!rating) throw new ApiError(404, "Review not found");

  await rating.update({ status });
  rating.status = status;

  await audit(req, {
    action: ACTIONS.RATING_MODERATE,
    entityType: "Rating",
    entityId: rating.id,
    metadata: { status, storeId: rating.storeId, userId: rating.userId },
  });

  res.json({
    success: true,
    message: status === "HIDDEN" ? "Review hidden" : "Review restored",
    review: {
      id: rating.id,
      status: rating.status,
    },
  });
};

// ==========================================
// ADMIN: AUDIT LOGS (paginated, filterable)
// GET /api/admin/audit-logs
// ==========================================
exports.getAuditLogs = async (req, res) => {
  const { page, limit, offset } = parsePageLimit(req.query, { max: 100, defaultLimit: 20 });
  const actorId = Number.parseInt(req.query.actorId, 10);
  const action = (req.query.action || "").trim();
  const entityType = (req.query.entityType || "").trim();
  const entityId = Number.parseInt(req.query.entityId, 10);

  const where = {};
  if (Number.isInteger(actorId)) where.actorUserId = actorId;
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (Number.isInteger(entityId)) where.entityId = entityId;
  if (req.query.from && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) where.createdAt = { [Op.gte]: `${req.query.from}T00:00:00` };
  if (req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) where.createdAt = { ...(where.createdAt || {}), [Op.lte]: `${req.query.to}T23:59:59` };

  const { count, rows } = await AuditLog.findAndCountAll({
    where,
    include: [{ model: User, attributes: ["id", "name", "email"], required: false }],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  res.json({
    success: true,
    logs: rows.map((l) => ({
      id: l.id,
      actorUserId: l.actorUserId,
      actorName: l.User?.name || "System",
      actorEmail: l.User?.email || null,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      metadata: l.metadata,
      ipAddress: l.ipAddress,
      createdAt: l.createdAt,
    })),
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 0 },
  });
};
