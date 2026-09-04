const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const {
  createBooking,
  getMyBookings,
  cancelBooking,
  getStoreBookings,
  updateBookingStatus,
  getBookingDetails,
} = require("../controllers/bookingController");

// CUSTOMER
router.post("/", authMiddleware, roleMiddleware("USER"), createBooking);
router.get("/my", authMiddleware, roleMiddleware("USER"), getMyBookings);
router.put("/:id/cancel", authMiddleware, roleMiddleware("USER"), cancelBooking);

// OWNER
router.get("/store", authMiddleware, roleMiddleware("OWNER"), getStoreBookings);
router.put("/:id/status", authMiddleware, roleMiddleware("OWNER"), updateBookingStatus);

// Details: the customer who owns it or the owner of its store
router.get("/:id", authMiddleware, getBookingDetails);

module.exports = router;
