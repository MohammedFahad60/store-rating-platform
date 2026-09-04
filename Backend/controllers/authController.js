const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User } = require("../models");
const { ApiError } = require("../utils/http");
const { publicUser } = require("../utils/sanitize");
const { audit, ACTIONS } = require("../utils/audit");
const {
  validateName,
  validateEmail,
  validatePassword,
  validateAddress,
  validatePhone,
} = require("../utils/validators");

exports.register = async (req, res) => {
  const { name, email, password, address, phone } = req.body || {};

  const errors = [
    validateName(name),
    validateEmail(email),
    validatePassword(password),
    validateAddress(address),
    validatePhone(phone),
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new ApiError(400, errors[0], errors);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await User.findOne({ where: { email: normalizedEmail } });
  if (existingUser) {
    throw new ApiError(409, "Email is already registered");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password: hashedPassword,
    address: address ? address.trim() : null,
    phone: phone ? phone.trim().replace(/[-\s()]/g, "") : null,
    role: "USER",
    status: "ACTIVE",
    passwordChangedAt: new Date(),
  });

  res.status(201).json({
    success: true,
    message: "User registered successfully",
    user: publicUser(user),
  });
};

exports.login = async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await User.findOne({
    where: { email: email.trim().toLowerCase() },
  });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    // Failed login is recorded WITHOUT the password (and without PII beyond
    // the attempted email) - passwords/JWTs are never logged.
    await audit(req, {
      action: ACTIONS.LOGIN_FAILED,
      entityType: "User",
      metadata: { email: String(email).trim().toLowerCase().slice(0, 254) },
    });
    throw new ApiError(401, "Invalid credentials");
  }

  if (user.status === "DISABLED") {
    await audit(req, {
      action: ACTIONS.LOGIN_FAILED,
      entityType: "User",
      entityId: user.id,
      metadata: { reason: "disabled_account" },
    });
    throw new ApiError(403, "Your account is disabled. Contact the administrator.");
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, tv: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );

  await audit(req, {
    action: ACTIONS.LOGIN,
    entityType: "User",
    entityId: user.id,
    metadata: { role: user.role },
  });

  res.json({
    success: true,
    message: "Login successful",
    token,
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
  });
};

exports.changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};

  if (!oldPassword) {
    throw new ApiError(400, "Current password is required");
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    throw new ApiError(400, passwordError);
  }

  const user = await User.findByPk(req.user.id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) {
    throw new ApiError(400, "Current password is incorrect");
  }

  user.password = await bcrypt.hash(newPassword, 10);
  // Invalidate every JWT issued before this moment (including the current one).
  user.passwordChangedAt = new Date();
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();

  await audit(req, {
    action: ACTIONS.PASSWORD_CHANGE,
    entityType: "User",
    entityId: user.id,
  });

  res.json({
    success: true,
    message: "Password updated successfully",
  });
};
