const express = require("express");
const {
  getServices,
  createService,
  updateServiceName,
  removeAdminFromService,
  addAdminToService,
} = require("../controllers/serviceController");
const { verifyToken, permissionCheck } = require("../middleware/auth");
const router = express.Router();

router.get("/list", verifyToken, permissionCheck("superAdmin"), getServices);
router.post("/create", verifyToken, permissionCheck("superAdmin"), createService);
router.post("/addAdmin", verifyToken, permissionCheck("superAdmin"), addAdminToService);
router.put("/update", verifyToken, permissionCheck("superAdmin"), updateServiceName);
router.delete("/rmAdmin", verifyToken, permissionCheck("superAdmin"), removeAdminFromService);

module.exports = router;
