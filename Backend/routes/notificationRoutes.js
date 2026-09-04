const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
} = require("../controllers/notificationController");

// Notifications are always scoped to the authenticated user (IDOR-safe).
router.get("/", authMiddleware, getNotifications);
router.get("/unread-count", authMiddleware, getUnreadCount);
router.put("/read-all", authMiddleware, markAllRead);
router.put("/:id/read", authMiddleware, markRead);

module.exports = router;
