const express = require("express");
const {
  createConclusion,
  listConclusions,
  getConclusionById,
  updateConclusion,
  genreate_conclusion,
} = require("../controllers/conclusionController");
const { verifyToken, permissionCheck } = require("../middleware/auth");

const router = express.Router();

router.post("/create", verifyToken, permissionCheck("admin"), createConclusion);
router.get("/list", verifyToken, permissionCheck("admin"), listConclusions);
router.get("/get/:id", verifyToken, permissionCheck("admin"), getConclusionById);
router.post("/update", verifyToken, permissionCheck("admin"), updateConclusion);
router.post("/genreate_conclusion", verifyToken, permissionCheck("admin"), genreate_conclusion);

module.exports = router;
