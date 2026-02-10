const express = require("express");
const router = express.Router();
const {
  signup,
  signin,
  getById,
  deleteById,
  getByToken,
  getList,
  passwordReset,
  update,
  getAdminSessions,
  getAdminServices,
  changeStatus,
  checkUsername,
  refreshToken,
  checkUsernameUpdate,
} = require("../controllers/authController");
const { verifyToken, permissionCheck } = require("../middleware/auth");
const { exportData, importData, restoreFromZip, uploadZipFile } = require("../controllers/registerController");

router.post("/signup", verifyToken, permissionCheck("superAdmin"), signup);

router.get("/get", verifyToken, permissionCheck("admin"), getById);

router.post("/signin", signin);

router.get("/getByToken", verifyToken, permissionCheck("admin"), getByToken);

router.get("/getById", verifyToken, permissionCheck("admin"), getById);

router.delete("/deleteById", verifyToken, permissionCheck("admin"), deleteById);

router.post("/passwordReset", passwordReset);

router.put("/changeStatus", verifyToken, permissionCheck("admin"), changeStatus);

router.get("/getAdminSessions/:id", verifyToken, permissionCheck("admin"), getAdminSessions);

router.get("/getAdminServices/:id", verifyToken, permissionCheck("admin"), getAdminServices);

router.put("/update", verifyToken, permissionCheck("admin"), update);

router.get("/list", verifyToken, permissionCheck("admin"), getList);

router.post("/refreshToken", refreshToken);

router.post("/me", verifyToken, permissionCheck("admin"), getByToken);

router.get("/checkUsername", verifyToken, permissionCheck("admin"), checkUsername);

router.get("/checkUsernameUpdate", verifyToken, permissionCheck("admin"), checkUsernameUpdate);

router.post("/backup", verifyToken, permissionCheck("superAdmin"), exportData);

router.post("/restore",verifyToken, permissionCheck("superAdmin"), importData);

router.post("/restore-from-zip",verifyToken, permissionCheck("superAdmin"), uploadZipFile, restoreFromZip);

module.exports = router;
