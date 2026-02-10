import Request from "utils/request";

const RaportService = {};

RaportService.create = function (data) {
	return Request.postRequest("raport/create", data);
};


RaportService.list = function (pageNumber, pageSize,search) {
	return Request.getRequest(`raport/list?pageNumber=${pageNumber}&pageSize=${pageSize}&name=${search}`);
};

RaportService.getByid = function (id) {
	return Request.getRequest(`raport/get?id=${id}`);
};

RaportService.downloadRapport = function (id, conclusionRegNum) {
	return Request.getRequest(`raport/download?registrationId=${id}&code=${conclusionRegNum}`);
};

RaportService.exportSpecialAnalysis = function (data) {
	return Request.postRequest("raport/createSP", data);
};

RaportService.generateOPRaport = function (data) {
	return Request.postRequest("raport/generateOPRaport", data);
};

RaportService.exportSpecialAVR = function (data) {
	return Request.postRequest("raport/createAVR", data);
};

RaportService.exportSpecialUPK = function (data) {
	return Request.postRequest("raport/createUPK", data);
};

RaportService.exportSpecialMalumotnoma = function (data) {
	return Request.postRequest("raport/createMalumotnoma", data);
};

RaportService.exportSpecialMalumotnomaList = function (data) {
	return Request.postRequest("raport/generateMalumotnomaList", data);
};

RaportService.createRelativeList = function (data) {
	return Request.postRequest("raport/dcreateRelativeList", data);
};

// Search relatives by raport id
RaportService.searchRelativesByRaportId = function (data) {
	return Request.postRequest("raport/searchRelativesByRaportId", data);
};

RaportService.update = function (data) {
	return Request.postRequest("raport/update", data);
};

RaportService.listExecutor = function (pageNumber=1, pageSize=10,id="",adminId="", search) {
	return Request.postRequest(`raport/listExecutor?pageNumber=${pageNumber}&pageSize=${pageSize}&registrationId=${id}&executorId=${adminId}`, search);
};

// Update RaportLink checkboxes (display, adminCheck, operator)
RaportService.updateLinkStatus = function (data) {
	return Request.postRequest("raport/updateLinkStatus", data);
};

export default RaportService;