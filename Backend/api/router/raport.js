const express = require("express");
const {
  generateReport,
  listRaports,
  downloadRaport,
  generateSP,
  listRaportsExecutor,
  getRaportTypeList,
  getRaportTypeById,
  createRaportType,
  updateRaportType,
  getRaportById,
  updateRaport,
  generateRelativeList,
  generateAVR,
  generateUPK,
  generateMalumotnoma,
  generateQuerySgb,
  generateQueryGsbp,
  generateOPRaport,
  generateMalumotnomaList,
  searchRelativesByRaportId,
  updateRaportLinkStatus
  
} = require("../controllers/raportController");
const {
  verifyToken,
  permissionCheck,
} = require("../middleware/auth");


const router = express.Router();

router.post("/create", verifyToken, permissionCheck("admin"), generateReport);
router.get("/list", verifyToken, permissionCheck("admin"), listRaports);
router.post("/listExecutor", verifyToken, permissionCheck("admin"), listRaportsExecutor);
router.get("/download", verifyToken, permissionCheck("admin"), downloadRaport);
router.post("/createSP", verifyToken, permissionCheck("admin"), generateSP);
router.post("/generateOPRaport", verifyToken, permissionCheck("admin"), generateOPRaport);
router.post("/updateLinkStatus", verifyToken, permissionCheck("admin"), updateRaportLinkStatus);
router.post("/generateMalumotnomaList", verifyToken, permissionCheck("admin"), generateMalumotnomaList);
router.post("/dcreateRelativeList", verifyToken, permissionCheck("admin"), generateRelativeList);
router.post("/searchRelativesByRaportId", verifyToken, permissionCheck("admin"), searchRelativesByRaportId);
router.post("/createAVR", verifyToken, permissionCheck("admin"), generateAVR);
router.post("/createUPK", verifyToken, permissionCheck("admin"), generateUPK);
router.post("/createMalumotnoma", verifyToken, permissionCheck("admin"), generateMalumotnoma);
router.post("/createQuerySgb", verifyToken, permissionCheck("admin"), generateQuerySgb);
router.post("/createQueryGsbp", verifyToken, permissionCheck("admin"), generateQueryGsbp);
router.get("/get", verifyToken, permissionCheck("admin"), getRaportById);
router.post("/update", verifyToken, permissionCheck("admin"), updateRaport);


router.post("/type/list", verifyToken, permissionCheck("admin"), getRaportTypeList);
router.get("/type/get/:id", verifyToken, permissionCheck("admin"), getRaportTypeById);
router.post("/type/create", verifyToken, permissionCheck("admin"), createRaportType);
router.post("/type/update/:id", verifyToken, permissionCheck("admin"), updateRaportType);

module.exports = router;
