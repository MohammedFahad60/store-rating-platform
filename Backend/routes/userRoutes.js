const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const { User } = require("../models");
const { ApiError } = require("../utils/http");
const { publicUser } = require("../utils/sanitize");
const { updateProfile } = require("../controllers/customerController");

// Returns the real profile of the authenticated user (never the password hash)
router.get("/profile", verifyToken, async (req, res) => {
  const user = await User.findByPk(req.user.id);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  res.json({
    success: true,
    user: publicUser(user),
  });
});

// Update own profile (name/email/phone/address)
router.put("/profile", verifyToken, updateProfile);

module.exports = router;
