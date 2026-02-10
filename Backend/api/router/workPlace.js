const express = require("express");
const {
  createWorkPlace,
  getWorkPlaces,
  updateWorkPlaceName,
  getById,
  deleteWorkPlace,
  getWorkPlacesByRegistration,
} = require("../controllers/workPlaceController");
const { verifyToken, permissionCheck, checkAdminAccess } = require("../middleware/auth");
const router = express.Router();

router.post("/create", verifyToken, checkAdminAccess(2), createWorkPlace);
router.get("/list", verifyToken, permissionCheck("admin"), getWorkPlaces);
router.put("/update", verifyToken, checkAdminAccess(2), updateWorkPlaceName);
router.delete("/delete/:id", verifyToken, checkAdminAccess(2), deleteWorkPlace);
router.get("/getById/:id", verifyToken, permissionCheck("admin"), getById);
router.get("/listByRegistration", verifyToken, permissionCheck("admin"), getWorkPlacesByRegistration);
module.exports = router;
