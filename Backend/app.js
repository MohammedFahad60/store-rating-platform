const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config({ quiet: true });

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const ownerRoutes = require("./routes/ownerRoutes");
const ratingRoutes = require("./routes/ratingRoutes");
const storeRoutes = require("./routes/StoreRoutes");
const userRoutes = require("./routes/userRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const favoriteRoutes = require("./routes/favoriteRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const customerRoutes = require("./routes/customerRoutes");

const { notFoundHandler, errorHandler } = require("./utils/http");
const { line, requestContext, httpLogger } = require("./utils/logger");

const app = express();

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

// Behind a reverse proxy/load balancer, Express must trust the first hop so
// rate limiting sees real client IPs. Only enabled outside local development.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Disable CSP in development so the Vite dev server (HMR inline scripts) is unaffected.
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false,
  })
);

// CORS - configurable through CLIENT_URL (comma separated list).
// When CLIENT_URL is missing, dev mode reflects any origin; production must
// configure CLIENT_URL (server.js fails fast if it is missing).
const allowedOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  })
);

// Structured request logging (method / route / status / duration / requestId).
// Silent in test mode; never logs auth headers, bodies or secrets.
app.use(requestContext);
app.use(httpLogger);

app.use(express.json({ limit: "1mb" }));

// Global API rate limiting (the health endpoint stays reachable for probes).
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later",
  },
  skip: (req) => req.path === "/api/health",
});
app.use(apiLimiter);

// Stricter rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later",
  },
});

// ==========================================
// HEALTH CHECK
// ==========================================
const health = require("./controllers/healthController");
app.get("/api/health", health.check);

// ==========================================
// ROUTES
// ==========================================

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/owner", ownerRoutes);
app.use("/api/ratings", ratingRoutes);
app.use("/api/stores", storeRoutes);
app.use("/api/users", userRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/customer", customerRoutes);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "STORE Platform API running",
    version: "1.0.0",
  });
});

// ==========================================
// CENTRAL ERROR HANDLING
// ==========================================

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
