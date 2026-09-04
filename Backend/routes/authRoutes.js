const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const {
  register,
  login,
  changePassword,
} = require("../controllers/authController");

router.post("/register", register);
router.post("/login", login);
router.put("/change-password", verifyToken, changePassword);

module.exports = router;
