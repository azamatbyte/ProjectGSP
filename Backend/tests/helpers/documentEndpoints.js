// Public document-generation inventory from DOC_GENERATION_APIS.md.
const groups = [
  ["raport", "raport", "raportController", "admin", [
    ["create", "generateReport"], ["createSP", "generateSP"], ["generateOPRaport", "generateOPRaport"],
    ["createAVR", "generateAVR"], ["createUPK", "generateUPK"], ["createMalumotnoma", "generateMalumotnoma"],
    ["generateMalumotnomaList", "generateMalumotnomaList"], ["dcreateRelativeList", "generateRelativeList"],
    ["createQuerySgb", "generateQuerySgb"], ["createQueryGsbp", "generateQueryGsbp"],
  ]],
  ["statistics", "statistcs", "statisticsController", "service3", [
    ["reportStatements", "reportStatements"], ["reportFromForm", "reportFromForm"],
    ["statisticsByForm", "statisticsByForm"], ["statisticsByYear", "statisticsByYear"],
    ["monitoringByAdmin", "monitoringByAdmin"], ["weeeklyReport", "weeeklyReport", "token"],
    ["dashboard_chart_export", "exportDashboardChart"],
  ]],
  ["registerFour", "registartionFour", "registerFourController", "admin", [
    ["export", "exportTemporaryDataToExcel"], ["exportMainSverka", "exportSverkaMain"], ["exportSverka", "exportSverka"],
  ]],
  ["register", "register", "registerController", "superAdmin", [["globalSearchExport", "globalSearchExport"]]],
  ["auth", "auth", "registerController", "superAdmin", [["backup", "exportData"], ["backup-pg", "exportPgDump"]]],
];
module.exports = groups.flatMap(([mount, router, controller, access, endpoints]) =>
  endpoints.map(([route, handler, override]) => ({ mount, router, controller, access: override || access,
    route: `/${route}`, url: `/api/v1/${mount}/${route}`, handler, method: "POST" })));
