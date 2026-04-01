const express = require("express");
const { verifyToken, permissionCheck } = require("../middleware/auth");
const router = express.Router();
const {
  createRegistration,
  getRegistrationById,
  getRegistrationList,
  updateRegistrationNumber,
  checkRegistrationNumber,
  findByNames,
  findByNamesTrgm,
  updateRegistration,
  getRegistrationLogs,
  getRegistrationLogById,
  globalSearch,
  globalSearchExport,
  globalSearchCount,
  getRegistrationsByIds,
  deleteRegistration,
  getRegistrationByIdProverka,
  updateStatusAll,
} = require("../controllers/registerController");

router.post("/create", verifyToken, permissionCheck("admin"), createRegistration);
router.get("/get/:id", verifyToken, permissionCheck("admin"), getRegistrationById);
router.get("/getProverka/:id", verifyToken, permissionCheck("admin"), getRegistrationByIdProverka);
router.post("/list", verifyToken, permissionCheck("admin"), getRegistrationList);
router.post("/update/:id", verifyToken, permissionCheck("admin"), updateRegistration);
router.post("/updateregnumber/:id", verifyToken, permissionCheck("admin"), updateRegistrationNumber);
router.get("/checkregnumber", verifyToken, permissionCheck("admin"), checkRegistrationNumber);
router.get("/findByNames", verifyToken, permissionCheck("admin"), findByNames);
router.get("/findByNamesTrgm", verifyToken, permissionCheck("admin"), findByNamesTrgm);
router.post("/logs", verifyToken, permissionCheck("admin"), getRegistrationLogs);
router.get("/logGetById/:logId", verifyToken, permissionCheck("admin"), getRegistrationLogById);
router.post("/globalSearch", verifyToken, permissionCheck("admin"), globalSearch);
router.post("/globalSearchExport", verifyToken, permissionCheck("superAdmin"), globalSearchExport);
router.post("/globalSearchCount", verifyToken, permissionCheck("admin"), globalSearchCount);
router.post("/getByIds", verifyToken, permissionCheck("admin"), getRegistrationsByIds);
router.delete("/delete/:id", verifyToken, permissionCheck("admin"), deleteRegistration);
router.post("/updateStatusAll", verifyToken, permissionCheck("admin"), updateStatusAll);


module.exports = router;
