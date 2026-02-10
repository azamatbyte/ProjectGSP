const express = require("express");
const {
  createAccessStatus,
  changeAccessStatus,
  listAccessStatusWithStatus,
  listAccessStatuses,
  getAccessStatusById,
  updateAccessStatus,
} = require("../controllers/statusController");
const { verifyToken, permissionCheck } = require("../middleware/auth");
const router = express.Router();

router.post("/create",  verifyToken,  permissionCheck("admin"),  createAccessStatus);
router.get("/list",  verifyToken,  permissionCheck("admin"),  listAccessStatuses);
router.get("/listWithStatus",  verifyToken,  permissionCheck("admin"), listAccessStatusWithStatus);
router.get("/getById/:id",  verifyToken,  permissionCheck("admin"),  getAccessStatusById);
router.put("/update/:id",  verifyToken,  permissionCheck("admin"),  updateAccessStatus);
router.get("/changeStatus",  verifyToken,  permissionCheck("admin"),  changeAccessStatus);

module.exports = router;
