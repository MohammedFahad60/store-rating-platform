const { Op } = require("sequelize");
const { sequelize, Rating, Store, User, Booking } = require("../models");
const { ApiError } = require("../utils/http");
const { validateRatingValue, parsePageLimit, parseSortField, parseSortDirection } = require("../utils/validators");
const { findOwnerStore } = require("../utils/ownerStore");
const { audit, ACTIONS } = require("../utils/audit");
const { notify, TYPES } = require("../utils/notify");

// ==========================================
// CUSTOMER: submit rating/review (requires a COMPLETED booking)
// POST /api/ratings  { storeId, rating, comment }
// ==========================================
exports.submitRating = async (req, res) => {
  const storeId = Number.parseInt(req.body?.storeId, 10);
  if (!Number.isInteger(storeId)) throw new ApiError(400, "A valid store id is required");

  const ratingError = validateRatingValue(req.body?.rating);
  if (ratingError) throw new ApiError(400, ratingError);

  let comment = null;
  if (req.body?.comment !== undefined && req.body.comment !== null) {
    if (typeof req.body.comment !== "string" || req.body.comment.trim().length > 1000) {
      throw new ApiError(400, "Review cannot exceed 1000 characters");
    }
    comment = req.body.comment.trim() || null;
  }

  const rating = await sequelize.transaction(async (transaction) => {
    const store = await Store.findByPk(storeId, { transaction });
    if (!store) throw new ApiError(404, "Store not found");

    const completedBooking = await Booking.findOne({
      where: { userId: req.user.id, storeId, status: "COMPLETED" },
      order: [["updatedAt", "DESC"]],
      transaction,
    });
    if (!completedBooking) {
      throw new ApiError(403, "You can only rate a store after one of your bookings is completed");
    }

    // One review per user+store is enforced by the DB unique index as well.
    const existing = await Rating.findOne({ where: { userId: req.user.id, storeId }, transaction });
    if (existing) throw new ApiError(409, "You have already rated this store");

    return Rating.create(
      {
        userId: req.user.id,
        storeId,
        bookingId: completedBooking.id,
        rating: Number(req.body.rating),
        comment,
        status: "VISIBLE",
      },
      { transaction }
    );
  });

  // Notify the store owner of the new review.
  const store = await Store.findByPk(storeId, { attributes: ["ownerId"] });
  await notify(
    store?.ownerId,
    TYPES.REVIEW_SUBMITTED,
    "New review received",
    `Your store received a ${rating.rating}-star review from a customer.`,
    { ratingId: rating.id, storeId }
  ).catch(() => {});

  res.status(201).json({
    success: true,
    message: "Rating submitted successfully",
    rating: serializeRating(rating),
  });
};

// ==========================================
// CUSTOMER: update own rating/review
// PUT /api/ratings/:id  { rating?, comment? }
// ==========================================
exports.updateRating = async (req, res) => {
  const ratingId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(ratingId)) throw new ApiError(400, "Invalid rating id");

  const existing = await Rating.findOne({ where: { id: ratingId, userId: req.user.id } });
  if (!existing) throw new ApiError(404, "Rating not found");

  const body = req.body || {};
  const payload = {};

  if (body.rating !== undefined) {
    const err = validateRatingValue(body.rating);
    if (err) throw new ApiError(400, err);
    payload.rating = Number(body.rating);
  }
  if (body.comment !== undefined) {
    if (body.comment === null || String(body.comment).trim() === "") payload.comment = null;
    else if (typeof body.comment !== "string" || body.comment.trim().length > 1000) {
      throw new ApiError(400, "Review cannot exceed 1000 characters");
    } else payload.comment = body.comment.trim();
  }
  if (Object.keys(payload).length === 0) throw new ApiError(400, "Nothing to update");

  await existing.update(payload);

  res.json({
    success: true,
    message: "Rating updated successfully",
    rating: serializeRating(existing),
  });
};

// ==========================================
// CUSTOMER: my reviews
// GET /api/ratings/my
// ==========================================
exports.getMyRatings = async (req, res) => {
  const { page, limit, offset } = parsePageLimit(req.query, { max: 50, defaultLimit: 10 });
  const { count, rows } = await Rating.findAndCountAll({
    where: { userId: req.user.id },
    include: [{ model: Store, attributes: ["id", "name", "category"] }, { model: User, attributes: ["id", "name"] }],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  res.json({
    success: true,
    ratings: rows.map((r) => serializeRating(r, { withStore: true })),
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 0 },
  });
};

// ==========================================
// STORE REVIEWS (visible only; owners see hidden too)
// GET /api/ratings/store/:storeId
// ==========================================
exports.getStoreRatings = async (req, res) => {
  const storeId = Number.parseInt(req.params.storeId, 10);
  if (!Number.isInteger(storeId)) throw new ApiError(400, "Invalid store id");

  const store = await Store.findByPk(storeId);
  if (!store) throw new ApiError(404, "Store not found");

  const isOwner = store.ownerId === req.user.id;
  if (store.status !== "ACTIVE" && !isOwner) {
    throw new ApiError(403, "This store is currently unavailable");
  }

  const where = { storeId };
  if (!isOwner) where.status = "VISIBLE";

  const ratings = await Rating.findAll({
    where,
    include: [{ model: User, attributes: ["id", "name"] }],
    order: [["createdAt", "DESC"]],
    limit: 100,
  });

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const r of ratings) {
    distribution[r.rating] = (distribution[r.rating] || 0) + 1;
    sum += r.rating;
  }

  res.json({
    success: true,
    averageRating: ratings.length ? (sum / ratings.length).toFixed(1) : "0.0",
    totalRatings: ratings.length,
    distribution,
    ratings: ratings.map((r) => serializeRating(r, { withUser: true })),
  });
};

// ==========================================
// OWNER: reply to a review of their store
// PUT /api/reviews/:id/reply  { reply }
// ==========================================
exports.replyToReview = async (req, res) => {
  const ratingId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(ratingId)) throw new ApiError(400, "Invalid review id");

  const reply = String(req.body?.reply || "").trim();
  if (!reply || reply.length > 2000) {
    throw new ApiError(400, "Reply is required (max 2000 characters)");
  }

  const store = await findOwnerStore(req.user.id);
  if (!store) throw new ApiError(404, "No store is assigned to your owner account");

  const rating = await Rating.findOne({ where: { id: ratingId, storeId: store.id } });
  if (!rating) throw new ApiError(404, "Review not found");

  await rating.update({ ownerReply: reply });

  await notify(
    rating.userId,
    TYPES.REVIEW_REPLIED,
    "Store replied to your review",
    `The store replied to your review: "${reply.slice(0, 120)}"`,
    { ratingId: rating.id, storeId: store.id }
  ).catch(() => {});

  res.json({
    success: true,
    message: "Reply posted successfully",
    rating: serializeRating(rating),
  });
};

function serializeRating(r, { withUser = false, withStore = false } = {}) {
  return {
    id: r.id,
    userId: r.userId,
    storeId: r.storeId,
    bookingId: r.bookingId,
    rating: r.rating,
    comment: r.comment,
    status: r.status,
    ownerReply: r.ownerReply,
    userName: withUser ? r.User?.name || "Customer" : undefined,
    store: withStore && r.Store
      ? { id: r.Store.id, name: r.Store.name, category: r.Store.category }
      : undefined,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

module.exports = {
  submitRating: exports.submitRating,
  updateRating: exports.updateRating,
  getMyRatings: exports.getMyRatings,
  getStoreRatings: exports.getStoreRatings,
  replyToReview: exports.replyToReview,
  serializeRating,
};
