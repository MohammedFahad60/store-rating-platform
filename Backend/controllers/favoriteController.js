const { sequelize, Favorite, Store } = require("../models");
const { ApiError } = require("../utils/http");
const { parsePageLimit } = require("../utils/validators");

// ==========================================
// CUSTOMER: list favorite stores
// GET /api/favorites
// ==========================================
exports.getFavorites = async (req, res) => {
  const { page, limit, offset } = parsePageLimit(req.query, { max: 50, defaultLimit: 12 });

  const { count, rows } = await Favorite.findAndCountAll({
    where: { userId: req.user.id },
    include: [
      {
        model: Store,
        attributes: ["id", "name", "category", "address", "phone", "description", "status"],
        include: [{ model: require("../models").Rating, attributes: ["rating"] }],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  res.json({
    success: true,
    favorites: rows.map((f) => {
      const ratings = f.Store?.Ratings || [];
      const avg = ratings.length ? (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1) : "0.0";
      return {
        id: f.id,
        storeId: f.storeId,
        addedAt: f.createdAt,
        store: {
          id: f.Store?.id,
          name: f.Store?.name,
          category: f.Store?.category,
          address: f.Store?.address,
          phone: f.Store?.phone,
          description: f.Store?.description,
          status: f.Store?.status,
          averageRating: avg,
          ratingCount: ratings.length,
        },
      };
    }),
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 0 },
  });
};

// ==========================================
// CUSTOMER: add favorite (idempotent, DB-unique)
// POST /api/favorites  { storeId }
// ==========================================
exports.addFavorite = async (req, res) => {
  const storeId = Number.parseInt(req.body?.storeId, 10);
  if (!Number.isInteger(storeId)) throw new ApiError(400, "A valid store id is required");

  const store = await Store.findByPk(storeId);
  if (!store) throw new ApiError(404, "Store not found");

  const [favorite, created] = await Favorite.findOrCreate({
    where: { userId: req.user.id, storeId },
  });

  res.status(created ? 201 : 200).json({
    success: true,
    message: created ? "Store added to favorites" : "Store is already in your favorites",
    favorite: { id: favorite.id, storeId: favorite.storeId },
  });
};

// ==========================================
// CUSTOMER: remove favorite
// DELETE /api/favorites/:storeId
// ==========================================
exports.removeFavorite = async (req, res) => {
  const storeId = Number.parseInt(req.params.storeId, 10);
  if (!Number.isInteger(storeId)) throw new ApiError(400, "Invalid store id");

  const destroyed = await Favorite.destroy({
    where: { userId: req.user.id, storeId },
  });

  if (destroyed === 0) throw new ApiError(404, "Favorite not found");

  res.json({
    success: true,
    message: "Store removed from favorites",
  });
};

// ==========================================
// CUSTOMER: is a store favorited?
// GET /api/favorites/:storeId/status
// ==========================================
exports.getFavoriteStatus = async (req, res) => {
  const storeId = Number.parseInt(req.params.storeId, 10);
  if (!Number.isInteger(storeId)) throw new ApiError(400, "Invalid store id");

  const favorite = await Favorite.findOne({ where: { userId: req.user.id, storeId } });
  res.json({ success: true, storeId, isFavorite: Boolean(favorite) });
};
