const validator = require("validator");

const ROLES = ["ADMIN", "OWNER", "USER"];
const STORE_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED"];
const BOOKING_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
];

// Allowed booking status transitions (owner actions)
const ALLOWED_BOOKING_TRANSITIONS = {
  PENDING: ["CONFIRMED", "REJECTED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
};

// 8-16 chars, at least one uppercase letter and one special character
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[!@#$%^&*]).{8,16}$/;

function validateName(value, field = "Name") {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) return `${field} is required`;
  if (name.length < 2 || name.length > 60) {
    return `${field} must be between 2 and 60 characters`;
  }
  return null;
}

function validateEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email) return "Email is required";
  if (!validator.isEmail(email)) return "Invalid email format";
  return null;
}

function validatePassword(value) {
  if (!value) return "Password is required";
  if (typeof value !== "string" || !PASSWORD_REGEX.test(value)) {
    return "Password must be 8-16 characters with at least one uppercase letter and one special character";
  }
  return null;
}

function validateAddress(value) {
  if (!value) return null;
  if (typeof value !== "string" || value.length > 400) {
    return "Address cannot exceed 400 characters";
  }
  return null;
}

function validateStorePayload(body) {
  const errors = [];

  const name = validateName(body.name, "Store name");
  if (name) errors.push(name);

  const email = validateEmail(body.email);
  if (email) errors.push(email);

  if (!body.address || typeof body.address !== "string" || !body.address.trim()) {
    errors.push("Address is required");
  } else if (body.address.length > 400) {
    errors.push("Address cannot exceed 400 characters");
  }

  if (body.phone && !/^[0-9+\-\s()]{7,20}$/.test(body.phone.trim())) {
    errors.push("Phone number is invalid");
  }

  if (body.category && (typeof body.category !== "string" || body.category.length > 100)) {
    errors.push("Category cannot exceed 100 characters");
  }

  return errors;
}

function validateServiceFields({ name, description, price, estimatedMinutes }) {
  const errors = [];

  if (!name || typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
    errors.push("Service name must be between 2 and 100 characters");
  }

  if (
    description !== undefined &&
    description !== null &&
    (typeof description !== "string" || description.trim().length > 2000)
  ) {
    errors.push("Description cannot exceed 2000 characters");
  }

  const numericPrice = Number(price);
  if (price === undefined || price === null || price === "" || !Number.isFinite(numericPrice)) {
    errors.push("Price is required and must be a number");
  } else if (numericPrice < 0) {
    errors.push("Price cannot be negative");
  } else if (numericPrice > 1000000) {
    errors.push("Price is too large");
  }

  const minutes = Number(estimatedMinutes);
  if (
    estimatedMinutes === undefined ||
    estimatedMinutes === null ||
    estimatedMinutes === "" ||
    !Number.isFinite(minutes) ||
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > 10080
  ) {
    errors.push("Estimated duration must be a whole number of minutes between 1 and 10080");
  }

  return errors;
}

function validateRatingValue(rating) {
  const value = Number(rating);
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    return "Rating must be a whole number between 1 and 5";
  }
  return null;
}

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

// ==========================================
// PHASE 3 VALIDATION HELPERS
// ==========================================

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PHONE_RE = /^[0-9+\-\s()]{7,20}$/;

function isValidDate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function validatePhone(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !PHONE_RE.test(value.trim())) {
    return "Phone number is invalid";
  }
  return null;
}

function validateTime(value, field = "Time") {
  if (typeof value !== "string" || !TIME_RE.test(value)) {
    return `${field} must be in HH:MM format (24-hour)`;
  }
  return null;
}

function validateDate(value, field = "Date") {
  if (!isValidDate(value)) {
    return `${field} must be a valid date in YYYY-MM-DD format`;
  }
  return null;
}

function validateLat(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < -90 || n > 90) return "Latitude must be between -90 and 90";
  return null;
}

function validateLng(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < -180 || n > 180) return "Longitude must be between -180 and 180";
  return null;
}

/** Parse pagination: page >= 1, limit 1..max (defaults 1 / 12). */
function parsePageLimit(query, { max = 50, defaultLimit = 12 } = {}) {
  const page = parsePositiveInt(query.page, 1, 1000000);
  const limit = parsePositiveInt(query.limit, defaultLimit, max);
  return { page, limit, offset: (page - 1) * limit };
}

/** Normalize analytics range: today | 7 | 30 | 90 (default 30). */
function parseRange(value) {
  const raw = String(value || "30").toLowerCase();
  if (raw === "today") return { range: "today", days: 1 };
  const days = Number.parseInt(raw, 10);
  if ([7, 30, 90].includes(days)) return { range: String(days), days };
  return { range: "30", days: 30 };
}

/** Parse a sort field against an allow-list. */
function parseSortField(value, allowed, fallback) {
  const raw = String(value || "").trim();
  return allowed.includes(raw) ? raw : fallback;
}

/** Parse a sort direction. */
function parseSortDirection(value) {
  return String(value || "").toLowerCase() === "asc" ? "ASC" : "DESC";
}

module.exports = {
  ROLES,
  STORE_STATUSES,
  BOOKING_STATUSES,
  ALLOWED_BOOKING_TRANSITIONS,
  PASSWORD_REGEX,
  validateName,
  validateEmail,
  validatePassword,
  validateAddress,
  validateStorePayload,
  validateServiceFields,
  validateRatingValue,
  parsePositiveInt,
  isValidDate,
  validatePhone,
  validateTime,
  validateDate,
  validateLat,
  validateLng,
  parsePageLimit,
  parseRange,
  parseSortField,
  parseSortDirection,
};
