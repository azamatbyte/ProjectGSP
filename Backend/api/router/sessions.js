const express = require("express");
const {
  createSession,
  deleteSession,
  swapSessions,
  listSessions,
  count,
  clear,
  addRelatives
} = require("../controllers/sessionController");
const { verifyToken, permissionCheck } = require("../middleware/auth");
const router = express.Router();

router.post("/create", verifyToken, permissionCheck("admin"), createSession);
router.delete("/delete/:id", verifyToken, permissionCheck("admin"), deleteSession);
router.post("/swap", verifyToken, permissionCheck("admin"), swapSessions);
router.get("/list", verifyToken, permissionCheck("admin"), listSessions);
router.get("/count", verifyToken, permissionCheck("admin"), count);
router.post("/clear", verifyToken, permissionCheck("admin"), clear);
router.post("/addRelatives", verifyToken, permissionCheck("admin"), addRelatives);

module.exports = router;
