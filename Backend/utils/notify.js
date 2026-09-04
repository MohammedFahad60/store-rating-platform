const { Notification } = require("../models");

const TYPES = {
  BOOKING_CREATED: "BOOKING_CREATED",
  BOOKING_STATUS: "BOOKING_STATUS",
  REVIEW_SUBMITTED: "REVIEW_SUBMITTED",
  REVIEW_REPLIED: "REVIEW_REPLIED",
  SERVICE_DEACTIVATED: "SERVICE_DEACTIVATED",
  STORE_STATUS: "STORE_STATUS",
};

/**
 * Create one in-app notification. Never stores passwords/JWTs in metadata -
 * only ids.
 */
async function notify(userId, type, title, message, metadata = {}, { transaction } = {}) {
  if (!userId) return null;
  return Notification.create(
    {
      userId,
      type,
      title: String(title).slice(0, 200),
      message: message ? String(message).slice(0, 1000) : null,
      read: false,
      metadata,
    },
    transaction ? { transaction } : undefined
  );
}

module.exports = { notify, TYPES };
