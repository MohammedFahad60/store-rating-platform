const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const {
  getFavorites,
  addFavorite,
  removeFavorite,
  getFavoriteStatus,
} = require("../controllers/favoriteController");

// Favorites are a customer feature.
router.get("/", authMiddleware, roleMiddleware("USER"), getFavorites);
router.get("/:storeId/status", authMiddleware, roleMiddleware("USER"), getFavoriteStatus);
router.post("/", authMiddleware, roleMiddleware("USER"), addFavorite);
router.delete("/:storeId", authMiddleware, roleMiddleware("USER"), removeFavorite);

module.exports = router;
