const { Notification } = require("../models");
const { ApiError } = require("../utils/http");
const { parsePageLimit } = require("../utils/validators");

// ==========================================
// NOTIFICATIONS: paginated feed (own only)
// GET /api/notifications?page=&limit=&unreadOnly=
// ==========================================
exports.getNotifications = async (req, res) => {
  const { page, limit, offset } = parsePageLimit(req.query, { max: 50, defaultLimit: 15 });
  const unreadOnly = String(req.query.unreadOnly || "") === "true";

  const where = { userId: req.user.id };
  if (unreadOnly) where.read = false;

  const { count, rows } = await Notification.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  const unreadCount = await Notification.count({ where: { userId: req.user.id, read: false } });

  res.json({
    success: true,
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      metadata: n.metadata,
      createdAt: n.createdAt,
    })),
    unreadCount,
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) || 0 },
  });
};

// ==========================================
// NOTIFICATIONS: unread count
// GET /api/notifications/unread-count
// ==========================================
exports.getUnreadCount = async (req, res) => {
  const unreadCount = await Notification.count({
    where: { userId: req.user.id, read: false },
  });

  res.json({ success: true, unreadCount });
};

// ==========================================
// NOTIFICATIONS: mark one as read
// PUT /api/notifications/:id/read
// ==========================================
exports.markRead = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) throw new ApiError(400, "Invalid notification id");

  const [updated] = await Notification.update(
    { read: true },
    { where: { id, userId: req.user.id } }
  );

  if (updated === 0) throw new ApiError(404, "Notification not found");

  const unreadCount = await Notification.count({ where: { userId: req.user.id, read: false } });
  res.json({ success: true, message: "Notification marked as read", unreadCount });
};

// ==========================================
// NOTIFICATIONS: mark all as read
// PUT /api/notifications/read-all
// ==========================================
exports.markAllRead = async (req, res) => {
  await Notification.update({ read: true }, { where: { userId: req.user.id, read: false } });

  res.json({ success: true, message: "All notifications marked as read", unreadCount: 0 });
};
