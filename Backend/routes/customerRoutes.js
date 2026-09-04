const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const { getCustomerDashboard } = require("../controllers/customerController");

// Customer dashboard (own data only)
router.get("/dashboard", authMiddleware, roleMiddleware("USER"), getCustomerDashboard);

module.exports = router;
