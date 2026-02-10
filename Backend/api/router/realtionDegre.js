const express = require("express");
const {
  create,
  getRelationDegrees,
  update,
  deleteRelationDegree,
  getById,
} = require("../controllers/relationDegreeController");
const { verifyToken, permissionCheck } = require("../middleware/auth");
const router = express.Router();

router.post("/create", verifyToken, permissionCheck("admin"), create);
router.get("/list", verifyToken, permissionCheck("admin"), getRelationDegrees);
router.put("/update/:id", verifyToken, permissionCheck("admin"), update);
router.delete("/delete/:id", verifyToken, permissionCheck("admin"), deleteRelationDegree);
router.get("/getById/:id", verifyToken, permissionCheck("admin"), getById);

module.exports = router;
