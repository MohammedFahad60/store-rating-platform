const { Sequelize } = require("sequelize");

class ApiError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

// Wrap async route handlers so thrown errors reach the central error handler.
const wrap = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      errors: err.errors,
    });
  }

  if (err instanceof Sequelize.UniqueConstraintError) {
    return res.status(409).json({
      success: false,
      message: "A record with the same value already exists",
    });
  }

  if (err instanceof Sequelize.ValidationError) {
    const message = err.errors?.[0]?.message || "Validation error";
    return res.status(400).json({
      success: false,
      message,
    });
  }

  if (err instanceof Sequelize.ForeignKeyConstraintError) {
    return res.status(400).json({
      success: false,
      message: "Referenced record does not exist",
    });
  }

  // JSON body parse errors (invalid JSON payload)
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON payload",
    });
  }

  // Structured error log. Stack traces can embed query values, so they are
  // only written outside production; the client always gets a generic body.
  const { line } = require("./logger");
  if (process.env.NODE_ENV === "production") {
    line("error", "unhandled.error", {
      requestId: req.id,
      method: req.method,
      path: req.path,
      message: err.message,
    });
  } else {
    line("error", "unhandled.error", {
      requestId: req.id,
      method: req.method,
      path: req.path,
      message: err.message,
      stack: err.stack,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

module.exports = { ApiError, wrap, notFoundHandler, errorHandler };
