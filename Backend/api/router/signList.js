const express = require("express");
const router = express.Router();
const {
  create,
  getById,
  deleteById,
  getList,
  update,
  changeStatus,
} = require("../controllers/signListController");
const { verifyToken, permissionCheck, checkAdminAccess } = require("../middleware/auth");

router.post("/create", verifyToken, checkAdminAccess(1), create);

router.get("/getById/:id", verifyToken, permissionCheck("admin"), getById);

router.delete("/deleteById/:id", verifyToken, checkAdminAccess(1), deleteById);

router.get("/list", verifyToken, permissionCheck("admin"), getList);

router.put("/update/:id", verifyToken, checkAdminAccess(1), update);

router.post("/changeStatus", verifyToken, checkAdminAccess(1), changeStatus);

module.exports = router;
