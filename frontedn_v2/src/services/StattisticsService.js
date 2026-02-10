import Request from "utils/request";

const StatisticsService = {};

StatisticsService.reportStatements = function (data) {
  return Request.postRequest("statistics/reportStatements", data);
};

StatisticsService.reportFromForm = function (data) {
  return Request.postRequest("statistics/reportFromForm", data);
};

//4-U eksport
StatisticsService.statisticsByForm = function (data) {
  return Request.postRequest("statistics/statisticsByForm", data);
};

StatisticsService.reportStatementsByYear = function (data) {
  return Request.postRequest("statistics/statisticsByYear", data);
};
//7-zapros
StatisticsService.monitoringWorkOperators = function (data) {
  return Request.postRequest("statistics/monitoringByAdmin", data);
};

//9-zapros
StatisticsService.weeeklyReport = function (data) {
  return Request.postRequest("statistics/weeeklyReport", data);
};

export default StatisticsService;
