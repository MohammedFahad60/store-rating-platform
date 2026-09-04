const { Op } = require("sequelize");
const { sequelize, Booking, Service, Store, User, StoreHour, Rating } = require("../models");
const { ApiError } = require("../utils/http");
const {
  BOOKING_STATUSES,
  ALLOWED_BOOKING_TRANSITIONS,
  parsePageLimit,
  parseSortField,
  parseSortDirection,
} = require("../utils/validators");
const { findOwnerStore } = require("../utils/ownerStore");
const { hoursMap, isOpenAt, normalizeTime } = require("../utils/hours");
const { audit, ACTIONS } = require("../utils/audit");
const { notify, TYPES } = require("../utils/notify");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ==========================================
// CUSTOMER: request a booking (Store -> Service -> Date -> Time -> Notes)
// POST /api/bookings  { serviceId, bookingDate, startTime, notes }
// ==========================================
exports.createBooking = async (req, res) => {
  const { serviceId, bookingDate, startTime, notes } = req.body || {};

  const parsedServiceId = Number.parseInt(serviceId, 10);
  if (!Number.isInteger(parsedServiceId)) {
    throw new ApiError(400, "A valid service id is required");
  }
  if (typeof bookingDate !== "string" || !DATE_RE.test(bookingDate)) {
    throw new ApiError(400, "A valid booking date (YYYY-MM-DD) is required");
  }
  if (typeof startTime !== "string" || !TIME_RE.test(startTime)) {
    throw new ApiError(400, "A valid start time (HH:MM) is required");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = new Date(`${bookingDate}T00:00:00`);
  if (Number.isNaN(selected.getTime()) || selected < today) {
    throw new ApiError(400, "Booking date cannot be in the past");
  }

  if (notes !== undefined && notes !== null) {
    if (typeof notes !== "string" || notes.trim().length > 1000) {
      throw new ApiError(400, "Notes cannot exceed 1000 characters");
    }
  }

  const booking = await sequelize.transaction(async (transaction) => {
    const service = await Service.findByPk(parsedServiceId, { transaction });
    if (!service) throw new ApiError(404, "Service not found");
    if (!service.active) throw new ApiError(400, "This service is no longer available");

    const store = await Store.findByPk(service.storeId, { transaction });
    if (!store || store.status !== "ACTIVE") {
      throw new ApiError(400, "This store is not currently accepting bookings");
    }

    // Operating hours: booking must fall inside the store's open window.
    const hourRows = await StoreHour.findAll({ where: { storeId: store.id }, transaction });
    const map = hoursMap(store, hourRows);
    if (!isOpenAt(map, bookingDate, startTime)) {
      throw new ApiError(400, "The store is closed at the selected time");
    }

    // Time-slot collision: another active booking at the same store/date/time.
    const collision = await Booking.findOne({
      where: {
        storeId: store.id,
        bookingDate,
        startTime,
        status: { [Op.in]: ["PENDING", "CONFIRMED", "IN_PROGRESS"] },
      },
      transaction,
    });
    if (collision) {
      throw new ApiError(409, "That time slot is no longer available");
    }

    const duplicate = await Booking.findOne({
      where: {
        userId: req.user.id,
        serviceId: service.id,
        bookingDate,
        status: { [Op.in]: ["PENDING", "CONFIRMED"] },
      },
      transaction,
    });
    if (duplicate) {
      throw new ApiError(409, "You already have an active booking for this service on that date");
    }

    // Price is ALWAYS snapshotted from the database - never from the body.
    return Booking.create(
      {
        userId: req.user.id,
        storeId: service.storeId,
        serviceId: service.id,
        bookingDate,
        startTime,
        price: service.price,
        notes: notes ? notes.trim() : null,
        status: "PENDING",
      },
      { transaction }
    );
  });

  // Notify the store owner (in-app) about the new request.
  const serviceRef = await Service.findByPk(booking.serviceId, { attributes: ["name"] });
  const ownerId = await storeOwnerId(booking.storeId);
  await notify(
    ownerId,
    TYPES.BOOKING_CREATED,
    "New booking request",
    `A customer requested "${serviceRef?.name || "a service"}" for ${bookingDate} at ${startTime}.`,
    { bookingId: booking.id, storeId: booking.storeId }
  ).catch(() => {});

  await audit(req, {
    action: ACTIONS.BOOKING_STATUS,
    entityType: "Booking",
    entityId: booking.id,
    metadata: { status: "PENDING" },
  });

  res.status(201).json({
    success: true,
    message: "Booking request sent successfully",
    booking: serializeBooking(booking),
  });
};

async function storeOwnerId(storeId) {
  const store = await Store.findByPk(storeId, { attributes: ["ownerId"] });
  return store?.ownerId || null;
}

function serializeBooking(b) {
  return {
    id: b.id,
    userId: b.userId,
    storeId: b.storeId,
    serviceId: b.serviceId,
    bookingDate: b.bookingDate,
    startTime: normalizeTime(b.startTime),
    status: b.status,
    price: Number(b.price),
    notes: b.notes,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

// ==========================================
// CUSTOMER: own bookings (filters + pagination)
// GET /api/bookings/my?status=&search=&from=&to=&page=&limit=
// ==========================================
exports.getMyBookings = async (req, res) => {
  const { page, limit, offset } = parsePageLimit(req.query, { max: 50, defaultLimit: 10 });
  const status = String(req.query.status || "").toUpperCase();
  const search = (req.query.search || "").trim();

  const where = { userId: req.user.id };
  if (status && BOOKING_STATUSES.includes(status)) where.status = status;
  if (req.query.from && DATE_RE.test(req.query.from)) where.bookingDate = { ...(where.bookingDate || {}), [Op.gte]: req.query.from };
  if (req.query.to && DATE_RE.test(req.query.to)) where.bookingDate = { ...(where.bookingDate || {}), [Op.lte]: req.query.to };

  // Database-level search (spans all pages) against the joined names.
  if (search) {
    const like = `%${search}%`;
    where[Op.or] = [
      { "$Store.name$": { [Op.like]: like } },
      { "$Service.name$": { [Op.like]: like } },
    ];
  }

  const { count, rows } = await Booking.findAndCountAll({
    where,
    include: [
      { model: Store, attributes: ["id", "name", "address", "category"], required: Boolean(search) },
      { model: Service, attributes: ["id", "name", "estimatedMinutes"], required: Boolean(search) },
    ],
    order: [["bookingDate", "DESC"], ["startTime", "DESC"], ["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
    subQuery: false,
  });

  res.json({
    success: true,
    bookings: rows.map((b) => ({
      id: b.id,
      storeId: b.storeId,
      serviceId: b.serviceId,
      storeName: b.Store?.name || "Store",
      storeAddress: b.Store?.address,
      storeCategory: b.Store?.category,
      serviceName: b.Service?.name || "Service",
      estimatedMinutes: b.Service?.estimatedMinutes,
      bookingDate: b.bookingDate,
      startTime: normalizeTime(b.startTime),
      status: b.status,
      price: Number(b.price),
      notes: b.notes,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    })),
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 0 },
  });
};

// ==========================================
// BOOKING DETAILS (customer owner of it OR owner of its store)
// GET /api/bookings/:id
// ==========================================
exports.getBookingDetails = async (req, res) => {
  const bookingId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(bookingId)) throw new ApiError(400, "Invalid booking id");

  const booking = await Booking.findByPk(bookingId, {
    include: [
      { model: Store, attributes: ["id", "name", "address", "category", "ownerId"] },
      { model: Service, attributes: ["id", "name", "estimatedMinutes", "price"] },
      { model: User, attributes: ["id", "name", "email", "phone"] },
    ],
  });
  if (!booking) throw new ApiError(404, "Booking not found");

  const isCustomer = booking.userId === req.user.id;
  const isOwner = booking.Store?.ownerId === req.user.id;
  if (!isCustomer && !isOwner) throw new ApiError(404, "Booking not found");

  const rating = await Rating.findOne({ where: { bookingId: booking.id } });

  res.json({
    success: true,
    booking: {
      id: booking.id,
      userId: booking.userId,
      storeId: booking.storeId,
      serviceId: booking.serviceId,
      customer: isOwner ? { id: booking.User?.id, name: booking.User?.name, email: booking.User?.email, phone: booking.User?.phone } : undefined,
      store: { id: booking.Store?.id, name: booking.Store?.name, address: booking.Store?.address, category: booking.Store?.category },
      service: { id: booking.Service?.id, name: booking.Service?.name, estimatedMinutes: booking.Service?.estimatedMinutes, price: Number(booking.Service?.price || 0) },
      bookingDate: booking.bookingDate,
      startTime: normalizeTime(booking.startTime),
      status: booking.status,
      price: Number(booking.price),
      notes: booking.notes,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
      rating: rating ? { id: rating.id, rating: rating.rating, comment: rating.comment } : null,
    },
  });
};

// ==========================================
// CUSTOMER: cancel own pending booking
// PUT /api/bookings/:id/cancel
// ==========================================
exports.cancelBooking = async (req, res) => {
  const bookingId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(bookingId)) throw new ApiError(400, "Invalid booking id");

  const booking = await Booking.findOne({ where: { id: bookingId, userId: req.user.id } });
  if (!booking) throw new ApiError(404, "Booking not found");

  if (booking.status !== "PENDING") {
    throw new ApiError(400, "Only pending bookings can be cancelled");
  }

  await booking.update({ status: "CANCELLED" });

  const ownerId = await storeOwnerId(booking.storeId);
  await notify(
    ownerId,
    TYPES.BOOKING_STATUS,
    "Booking cancelled",
    `A customer cancelled their booking on ${booking.bookingDate} at ${normalizeTime(booking.startTime)}.`,
    { bookingId: booking.id, storeId: booking.storeId }
  ).catch(() => {});

  await audit(req, {
    action: ACTIONS.BOOKING_STATUS,
    entityType: "Booking",
    entityId: booking.id,
    metadata: { status: "CANCELLED", by: "customer" },
  });

  res.json({
    success: true,
    message: "Booking cancelled successfully",
    booking: serializeBooking(booking),
  });
};

// ==========================================
// OWNER: bookings for own store
// GET /api/bookings/store?status=&search=&from=&to=&sort=&page=&limit=
// ==========================================
exports.getStoreBookings = async (req, res) => {
  const store = await findOwnerStore(req.user.id);
  if (!store) throw new ApiError(404, "No store is assigned to your owner account");

  const { page, limit, offset } = parsePageLimit(req.query, { max: 50, defaultLimit: 10 });
  const search = (req.query.search || "").trim();
  const sort = parseSortField(req.query.sort, ["date", "created", "customer", "status"], "date");
  const direction = parseSortDirection(req.query.order);

  const where = { storeId: store.id };
  const status = String(req.query.status || "").toUpperCase();
  if (status && BOOKING_STATUSES.includes(status)) where.status = status;
  if (req.query.from && DATE_RE.test(req.query.from)) where.bookingDate = { ...(where.bookingDate || {}), [Op.gte]: req.query.from };
  if (req.query.to && DATE_RE.test(req.query.to)) where.bookingDate = { ...(where.bookingDate || {}), [Op.lte]: req.query.to };

  const orderMap = {
    date: [["bookingDate", direction], ["startTime", direction]],
    created: [["createdAt", direction]],
    customer: [[{ model: User }, "name", direction]],
    status: [["status", direction]],
  };

  // Search is applied at the database level so it spans ALL pages (not just
  // the current page). The join stays LEFT (display-only) via the aliases.
  if (search) {
    const like = `%${search}%`;
    where[Op.or] = [
      { "$User.name$": { [Op.like]: like } },
      { "$User.email$": { [Op.like]: like } },
      { "$Service.name$": { [Op.like]: like } },
    ];
  }

  const { count, rows } = await Booking.findAndCountAll({
    where,
    include: [
      { model: User, attributes: ["id", "name", "email"], required: Boolean(search) },
      { model: Service, attributes: ["id", "name", "estimatedMinutes"], required: Boolean(search) },
    ],
    order: orderMap[sort],
    limit,
    offset,
    distinct: true,
    subQuery: false,
  });

  res.json({
    success: true,
    bookings: rows.map((b) => ({
      id: b.id,
      userId: b.userId,
      serviceId: b.serviceId,
      customerName: b.User?.name || "Customer",
      customerEmail: b.User?.email,
      serviceName: b.Service?.name || "Service",
      estimatedMinutes: b.Service?.estimatedMinutes,
      bookingDate: b.bookingDate,
      startTime: normalizeTime(b.startTime),
      status: b.status,
      price: Number(b.price),
      notes: b.notes,
      createdAt: b.createdAt,
    })),
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 0 },
  });
};

// ==========================================
// OWNER: update booking status (transition map enforced)
// PUT /api/bookings/:id/status
// ==========================================
exports.updateBookingStatus = async (req, res) => {
  const bookingId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(bookingId)) throw new ApiError(400, "Invalid booking id");

  const nextStatus = String(req.body?.status || "").toUpperCase();
  if (!BOOKING_STATUSES.includes(nextStatus)) {
    throw new ApiError(400, "Invalid booking status");
  }

  const store = await findOwnerStore(req.user.id);
  if (!store) throw new ApiError(404, "No store is assigned to your owner account");

  const booking = await Booking.findOne({ where: { id: bookingId, storeId: store.id } });
  if (!booking) throw new ApiError(404, "Booking not found");

  const allowed = ALLOWED_BOOKING_TRANSITIONS[booking.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw new ApiError(400, `Cannot change a booking from ${booking.status} to ${nextStatus}`);
  }

  await booking.update({ status: nextStatus });

  // In-app notification to the customer on every status change.
  const messages = {
    CONFIRMED: ["Booking confirmed", `Your booking at ${booking.bookingDate} ${normalizeTime(booking.startTime)} has been confirmed.`],
    IN_PROGRESS: ["Booking started", `Your booking at ${booking.bookingDate} ${normalizeTime(booking.startTime)} has started.`],
    COMPLETED: ["Booking completed", `Your booking at ${booking.bookingDate} ${normalizeTime(booking.startTime)} is complete - you can now leave a review.`],
    REJECTED: ["Booking rejected", `Your booking at ${booking.bookingDate} ${normalizeTime(booking.startTime)} was rejected by the store.`],
    CANCELLED: ["Booking cancelled", `Your booking at ${booking.bookingDate} ${normalizeTime(booking.startTime)} was cancelled.`],
  };
  const [title, message] = messages[nextStatus] || ["Booking updated", `Your booking status is now ${nextStatus}.`];
  await notify(booking.userId, TYPES.BOOKING_STATUS, title, message, {
    bookingId: booking.id,
    storeId: booking.storeId,
  }).catch(() => {});

  await audit(req, {
    action: ACTIONS.BOOKING_STATUS,
    entityType: "Booking",
    entityId: booking.id,
    metadata: { from: booking.status, to: nextStatus, by: "owner" },
  });

  res.json({
    success: true,
    message: `Booking ${nextStatus.toLowerCase().replace("_", " ")} successfully`,
    booking: serializeBooking(booking),
  });
};
