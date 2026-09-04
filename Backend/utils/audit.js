const { AuditLog } = require("../models");

const ACTIONS = {
  LOGIN: "auth.login",
  LOGIN_FAILED: "auth.login_failed",
  PASSWORD_CHANGE: "auth.password_change",
  USER_CREATE: "user.create",
  USER_STATUS: "user.status",
  STORE_CREATE: "store.create",
  STORE_UPDATE: "store.update",
  STORE_STATUS: "store.status",
  STORE_HOURS_UPDATE: "store.hours_update",
  SERVICE_CREATE: "service.create",
  SERVICE_UPDATE: "service.update",
  SERVICE_DEACTIVATE: "service.deactivate",
  BOOKING_STATUS: "booking.status",
  RATING_MODERATE: "rating.moderate",
};

/**
 * Append an administrative audit log entry.
 *
 * - actorUserId: derived from the authenticated user (never the body).
 * - metadata: JSON-safe ids/values only - passwords and JWTs are never
 *   logged.
 * - Best-effort: audit failures are logged to the console but do NOT fail
 *   the business action.
 */
async function logAudit({ actorUserId, action, entityType = null, entityId = null, metadata = null, ipAddress = null } = {}) {
  try {
    return await AuditLog.create({
      actorUserId: actorUserId ?? null,
      action,
      entityType,
      entityId,
      metadata,
      ipAddress,
    });
  } catch (error) {
    console.error("[AuditLog] Failed to write audit entry:", error.message);
    return null;
  }
}

/** Extract the client IP (respecting the trust-proxy setting). */
function clientIp(req) {
  return String(req.ip || req.connection?.remoteAddress || "").slice(0, 45) || null;
}

/** Convenience wrapper for controllers that have `req`. */
function audit(req, payload) {
  return logAudit({
    ...payload,
    actorUserId: req.user?.id ?? null,
    ipAddress: clientIp(req),
  });
}

module.exports = { logAudit, audit, ACTIONS };
