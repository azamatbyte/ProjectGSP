const express = require("express");
const {
  reportStatements,
  reportFromForm,
  statisticsByYear,
  statisticsByForm,
  monitoringByAdmin,
  weeeklyReport,
  countedRecords,
  finishedRegistrationPercentage,
  latestTransactions,
  topOtk1Workplaces,
} = require("../controllers/statisticsController");
const { verifyToken, checkAdminAccess } = require("../middleware/auth");

const router = express.Router();
// 1- zapros
router.post("/reportStatements", verifyToken, checkAdminAccess(3), reportStatements);
// 2- zapros
router.post("/reportFromForm", verifyToken, checkAdminAccess(3), reportFromForm);
// 4- zapros
router.post("/statisticsByForm", verifyToken, checkAdminAccess(3), statisticsByForm);
// 6- zapros
router.post("/statisticsByYear", verifyToken, checkAdminAccess(3), statisticsByYear);
// 7- zapros
router.post("/monitoringByAdmin", verifyToken, checkAdminAccess(3), monitoringByAdmin);
// 9- zapros
router.post("/weeeklyReport", verifyToken, weeeklyReport);
// counted records
router.post("/counted_records", verifyToken, checkAdminAccess(3), countedRecords);
// finished registration percentage
router.post("/finished_registration_percentage", verifyToken, checkAdminAccess(3), finishedRegistrationPercentage);
// latest transactions dashboard
router.post("/latest_transactions", verifyToken, checkAdminAccess(3), latestTransactions);
// top otk1 workplaces
router.post("/top_otk1_workplaces", verifyToken, checkAdminAccess(3), topOtk1Workplaces);
module.exports = router;
