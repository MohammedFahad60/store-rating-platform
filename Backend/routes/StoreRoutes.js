const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const {
  getStores,
  getStoreById,
  getStoreAvailability,
} = require("../controllers/storeController");

// Store discovery (search / filter / sort / pagination) - active stores only
router.get("/", verifyToken, getStores);

// Time-slot availability for a date (before the booking endpoint)
router.get("/:id/availability", verifyToken, getStoreAvailability);

// Store detail (metadata + stats)
router.get("/:id", verifyToken, getStoreById);

module.exports = router;
