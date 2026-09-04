const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const {
  submitRating,
  updateRating,
  getMyRatings,
  getStoreRatings,
  replyToReview,
} = require("../controllers/ratingController");

// Any authenticated user can view a store's ratings/reviews
router.get("/store/:storeId", authMiddleware, getStoreRatings);

// CUSTOMER: own reviews
router.get("/my", authMiddleware, roleMiddleware("USER"), getMyRatings);

// CUSTOMER: only customers submit ratings/reviews (owners/admins cannot)
router.post("/", authMiddleware, roleMiddleware("USER"), submitRating);

// CUSTOMER: update own rating/review
router.put("/:id", authMiddleware, roleMiddleware("USER"), updateRating);

// OWNER: reply to a review of their own store (review ownership enforced)
router.put("/:id/reply", authMiddleware, roleMiddleware("OWNER"), replyToReview);

module.exports = router;
