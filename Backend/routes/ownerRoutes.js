const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");
const { ownerDashboard } = require("../controllers/storeController");
const {
  getStoreSettings,
  updateStoreSettings,
  updateStoreHours,
  getOwnerCustomers,
  getOwnerCustomerDetails,
} = require("../controllers/storeController");
const { getManagedServices } = require("../controllers/serviceController");
const { ownerAnalytics } = require("../controllers/analyticsController");

router.get("/dashboard", verifyToken, authorizeRoles("OWNER"), ownerDashboard);

router.get("/store", verifyToken, authorizeRoles("OWNER"), getStoreSettings);
router.put("/store", verifyToken, authorizeRoles("OWNER"), updateStoreSettings);
router.put("/store/hours", verifyToken, authorizeRoles("OWNER"), updateStoreHours);

// Owner service management (search / filter / sort / pagination / stats)
router.get("/services", verifyToken, authorizeRoles("OWNER"), getManagedServices);

// Owner customers - only customers who interacted with this store
router.get("/customers", verifyToken, authorizeRoles("OWNER"), getOwnerCustomers);
router.get("/customers/:id", verifyToken, authorizeRoles("OWNER"), getOwnerCustomerDetails);

// Owner analytics
router.get("/analytics", verifyToken, authorizeRoles("OWNER"), ownerAnalytics);

module.exports = router;
