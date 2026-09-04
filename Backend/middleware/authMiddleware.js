const jwt = require("jsonwebtoken");
const { User } = require("../models");

/**
 * JWT authentication middleware.
 *
 * - Requires `Authorization: Bearer <token>`.
 * - Verifies signature + expiry (invalid/expired/malformed -> 401).
 * - Confirms the user still exists and rejects tokens that were issued
 *   before the user's last password change (token invalidation).
 * - The role is taken from the DATABASE (not from the token payload), so a
 *   stale token can never carry an outdated, escalated role.
 */
const verifyToken = async (req, res, next) => {
  try {
    const header = String(req.headers.authorization || "");
    const match = header.match(/^Bearer\s+(\S+)$/i);

    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Authentication token required",
      });
    }

    const token = match[1];

    let verified;
    try {
      verified = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      const message =
        error.name === "TokenExpiredError"
          ? "Session expired. Please sign in again."
          : "Invalid or malformed token";
      return res.status(401).json({ success: false, message });
    }

    if (!verified || !Number.isInteger(verified.id) || !verified.role) {
      return res.status(401).json({
        success: false,
        message: "Invalid or malformed token",
      });
    }

    const user = await User.findByPk(verified.id, {
      attributes: ["id", "role", "status", "tokenVersion"],
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Account no longer exists. Please sign in again.",
      });
    }

    // Disabled accounts cannot use any token (admin suspension/disable).
    if (user.status === "DISABLED") {
      return res.status(401).json({
        success: false,
        message: "Account is disabled. Contact the administrator.",
      });
    }

    // Password-change token invalidation: every token carries the token
    // version it was issued with; a mismatch (e.g. after a password change)
    // means the session is stale and must be rejected.
    if (verified.tv !== (user.tokenVersion || 0)) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please sign in again.",
      });
    }

    req.user = {
      id: user.id,
      role: user.role,
    };

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = verifyToken;
