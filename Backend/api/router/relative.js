const express = require("express");
const { verifyToken, permissionCheck } = require("../middleware/auth");
const router = express.Router();
const {
  createRelative,
  getRelativesList,
  searchRelatives,
  deleteRelative,
  getById,
  getRelativesListByRegistrationId,
  updateRelative,
  getRelativesByRegistrationId,
  getAllRelativesByRegistrationId,
  deplicateRelative,
  addRelativesBySession,
} = require("../controllers/relativeController");

router.post("/create", verifyToken, createRelative);
router.get("/search", verifyToken, getRelativesList);
router.post("/list", verifyToken, searchRelatives);
router.post(
  "/list_by_registrationId",
  verifyToken,
  getRelativesListByRegistrationId
);
router.delete(
  "/delete/:id",
  verifyToken,
  permissionCheck("superAdmin"),
  deleteRelative
);
router.get("/getById/:id", verifyToken, permissionCheck("admin"), getById);
router.post("/duplicate/:id", verifyToken, permissionCheck("admin"), deplicateRelative);
router.put("/update/:id", verifyToken, permissionCheck("admin"), updateRelative);
router.get("/byRegistrationId/:id", verifyToken, permissionCheck("admin"), getRelativesByRegistrationId);
router.get("/allByRegistrationId/:id", verifyToken, permissionCheck("admin"), getAllRelativesByRegistrationId);
router.post("/addRelativesBySession", verifyToken, permissionCheck("admin"), addRelativesBySession);

module.exports = router;
