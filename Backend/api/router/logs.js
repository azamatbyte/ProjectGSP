const express = require("express");
const { getLogs } = require("../controllers/logController");
const { verifyToken, permissionCheck } = require("../middleware/auth");
const router = express.Router();

router.get("/list", verifyToken, permissionCheck("admin"), getLogs);

module.exports = router;
