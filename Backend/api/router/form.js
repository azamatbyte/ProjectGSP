const express = require("express");
const { createForm, listForms, getById, update, changeFormStatus, listFormsWithStatus } = require("../controllers/formController");
const { verifyToken, permissionCheck } = require("../middleware/auth");
const router = express.Router();

router.post("/create", verifyToken,permissionCheck("admin"), createForm);
router.get("/list", verifyToken, permissionCheck("admin"), listForms);
router.get("/listWithStatus", verifyToken, permissionCheck("admin"), listFormsWithStatus);
router.get("/getById/:id", verifyToken, permissionCheck("admin"), getById);
router.put("/update/:id", verifyToken, permissionCheck("admin"), update);
router.get("/changeStatus", verifyToken, permissionCheck("admin"), changeFormStatus);

module.exports = router;
