const express = require("express");
const router = express.Router();
const {
  signup,
  signin,
  getById,
  deleteById,
  getByToken,
  getList,
  changePassword,
  resetPassword,
  update,
  getAdminSessions,
  getAdminServices,
  changeStatus,
  checkUsername,
  refreshToken,
  logout,
  checkUsernameUpdate,
} = require("../controllers/authController");
const { verifyToken, permissionCheck } = require("../middleware/auth");
const {
  loginLimiter,
  passwordLimiter,
  refreshLimiter,
} = require("../middleware/request_limitter");
const { exportData, importData, restoreFromZip, uploadZipFile, exportPgDump, restorePgDump, uploadSqlFile } = require("../controllers/registerController");

router.post("/signup", verifyToken, permissionCheck("superAdmin"), signup);

router.get("/get", verifyToken, permissionCheck("admin"), getById);

router.post("/signin", loginLimiter, signin);

router.get("/getByToken", verifyToken, permissionCheck("admin"), getByToken);

router.get("/getById", verifyToken, permissionCheck("admin"), getById);

router.delete("/deleteById", verifyToken, permissionCheck("admin"), deleteById);

// Self-service: the caller changes their OWN password and must prove the old one.
// verifyToken runs first so the limiter can key on the account, not just the IP.
router.post("/changePassword", verifyToken, passwordLimiter, changePassword);

// Recovery: a superAdmin resets someone else's password without the old one.
router.post("/resetPassword", verifyToken, permissionCheck("superAdmin"), resetPassword);

router.put("/changeStatus", verifyToken, permissionCheck("admin"), changeStatus);

router.get("/getAdminSessions/:id", verifyToken, permissionCheck("admin"), getAdminSessions);

router.get("/getAdminServices/:id", verifyToken, permissionCheck("admin"), getAdminServices);

router.put("/update", verifyToken, permissionCheck("admin"), update);

router.get("/list", verifyToken, permissionCheck("admin"), getList);

router.post("/refreshToken", refreshLimiter, refreshToken);
router.post("/logout", logout);

router.post("/me", verifyToken, permissionCheck("admin"), getByToken);

router.get("/checkUsername", verifyToken, permissionCheck("admin"), checkUsername);

router.get("/checkUsernameUpdate", verifyToken, permissionCheck("admin"), checkUsernameUpdate);

router.post("/backup", verifyToken, permissionCheck("superAdmin"), exportData);

router.post("/restore",verifyToken, permissionCheck("superAdmin"), importData);

router.post("/restore-from-zip",verifyToken, permissionCheck("superAdmin"), uploadZipFile, restoreFromZip);

router.post("/backup-pg", verifyToken, permissionCheck("superAdmin"), exportPgDump);
router.post("/restore-pg", verifyToken, permissionCheck("superAdmin"), uploadSqlFile, restorePgDump);

module.exports = router;
