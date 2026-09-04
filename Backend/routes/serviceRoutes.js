const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const {
  getMyStore,
  getStoreServices,
  getServiceDetail,
  createService,
  updateService,
  deactivateService,
} = require("../controllers/serviceController");

// OWNER: store info + services of the owner's store (single round trip)
router.get("/my-store", authMiddleware, roleMiddleware("OWNER"), getMyStore);

// Any authenticated user: services offered by a store
// (customers only see active services, the store owner sees all)
router.get("/store/:storeId", authMiddleware, getStoreServices);

// OWNER: managed service list (search / filter / sort / pagination / stats)
// Order matters: /my-store and /store/:storeId are matched before /:id.
router.get("/:id", authMiddleware, getServiceDetail);

// OWNER: create service (store is derived from the JWT, never from the body)
router.post("/", authMiddleware, roleMiddleware("OWNER"), createService);

// OWNER: update / activate / deactivate a service
router.put("/:id", authMiddleware, roleMiddleware("OWNER"), updateService);

// OWNER: soft delete (deactivate) a service
router.delete("/:id", authMiddleware, roleMiddleware("OWNER"), deactivateService);

module.exports = router;
