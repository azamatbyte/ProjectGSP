const express = require("express");
const router = express.Router();
const {
  getList,
  create,
  getById,
  deleteInitiator,
  update,
} = require("../controllers/intiatorController");
const { verifyToken, permissionCheck } = require("../middleware/auth");

router.get("/list", verifyToken, permissionCheck("admin"), getList);
router.post("/create", verifyToken, permissionCheck("admin"), create);
router.get("/getById", verifyToken, permissionCheck("admin"), getById);
router.delete("/delete/:id", verifyToken,permissionCheck("superAdmin"), deleteInitiator);
router.put("/update/:id", verifyToken, permissionCheck("admin"), update);

module.exports = router;
