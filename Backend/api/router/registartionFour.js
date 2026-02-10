const express = require("express");
const {
  uploadExcel,
  getTemporaryDataList,
  updateTemporaryDataStatus,
  getTemporaryDataById,
  exportTemporaryDataToExcel,
  migrate,
  save,
  actionFast,
  deploy,
  deleteTemporaryData,
  deleteAllTemporaryDataByFilter,
  addManualRegistration,
  getIdsOfList,
  exportSverka,
  exportSverkaMain,
} = require("../controllers/registerFourController");
const {
  verifyToken,
  permissionCheck,
} = require("../middleware/auth");
const router = express.Router();

router.post("/upload-excel", verifyToken, permissionCheck("admin"), uploadExcel);
router.post("/list", verifyToken, permissionCheck("admin"), getTemporaryDataList);
router.post("/getIdsOfList", verifyToken, permissionCheck("admin"), getIdsOfList);
router.post("/export", verifyToken, permissionCheck("admin"), exportTemporaryDataToExcel);
router.post("/exportMainSverka", verifyToken, permissionCheck("admin"), exportSverkaMain);
router.post("/exportSverka", verifyToken, permissionCheck("admin"), exportSverka);
router.get("/migrate/:id", verifyToken, permissionCheck("admin"), migrate);
router.get("/save/:id", verifyToken, permissionCheck("admin"), save);
router.post("/deploy", verifyToken, permissionCheck("admin"), deploy);
router.post("/update/:id", verifyToken, permissionCheck("admin"), updateTemporaryDataStatus);
router.get("/get/:id", verifyToken, permissionCheck("admin"), getTemporaryDataById);
router.post("/actionFast/:id", verifyToken, permissionCheck("admin"), actionFast);
router.delete("/delete", verifyToken, permissionCheck("admin"), deleteTemporaryData);
router.post("/deleteAllTemporaryDataByFilter", verifyToken, permissionCheck("admin"), deleteAllTemporaryDataByFilter);
router.post("/upload-manual", verifyToken, permissionCheck("admin"), addManualRegistration);

module.exports = router;
