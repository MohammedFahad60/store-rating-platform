const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");
const {
  getDashboard,
  createUser,
  createStore,
  getUsers,
  getStores,
  getUserById,
  updateUserStatus,
  updateStoreStatus,
  getAdminBookings,
  getAdminReviews,
  moderateReview,
  getAuditLogs,
} = require("../controllers/adminController");
const { adminAnalytics } = require("../controllers/analyticsController");

router.get("/dashboard", verifyToken, authorizeRoles("ADMIN"), getDashboard);
router.get("/analytics", verifyToken, authorizeRoles("ADMIN"), adminAnalytics);

router.post("/users", verifyToken, authorizeRoles("ADMIN"), createUser);
router.get("/users", verifyToken, authorizeRoles("ADMIN"), getUsers);
router.get("/users/:id", verifyToken, authorizeRoles("ADMIN"), getUserById);
router.put("/users/:id/status", verifyToken, authorizeRoles("ADMIN"), updateUserStatus);

router.post("/stores", verifyToken, authorizeRoles("ADMIN"), createStore);
router.get("/stores", verifyToken, authorizeRoles("ADMIN"), getStores);
router.put("/stores/:id/status", verifyToken, authorizeRoles("ADMIN"), updateStoreStatus);

// Admin bookings (view + inspect only)
router.get("/bookings", verifyToken, authorizeRoles("ADMIN"), getAdminBookings);

// Admin reviews (moderation - hide/restore, never delete)
router.get("/reviews", verifyToken, authorizeRoles("ADMIN"), getAdminReviews);
router.put("/reviews/:id/status", verifyToken, authorizeRoles("ADMIN"), moderateReview);

// Admin audit logs
router.get("/audit-logs", verifyToken, authorizeRoles("ADMIN"), getAuditLogs);

module.exports = router;
