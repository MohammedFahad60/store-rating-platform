const { sequelize } = require("../models");

/**
 * GET /api/health
 *
 * Lightweight liveness/readiness probe. Checks database connectivity without
 * exposing credentials, connection strings, host names or stack traces.
 */
exports.check = async (req, res) => {
  try {
    await sequelize.authenticate();
    await sequelize.query("SELECT 1", { type: sequelize.QueryTypes.SELECT });

    return res.json({
      success: true,
      status: "ok",
      database: "connected",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      status: "unavailable",
      message: "Service is temporarily unavailable",
    });
  }
};
