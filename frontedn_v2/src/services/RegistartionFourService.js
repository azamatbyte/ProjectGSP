import Request from "utils/request";

const RegistrationFourService = {};

RegistrationFourService.create = function (data) {
	return Request.postRequest("registerFour/upload-excel", data);
};

RegistrationFourService.createManual = function (data) {
	return Request.postRequest("registerFour/upload-manual", data);
};

RegistrationFourService.getList = function (search=null, pageNumber=1, pageSize=10) {
	return Request.postRequest("registerFour/list",{...search, pageNumber, pageSize});
};

RegistrationFourService.getIdsOfList = function (search=null) {
	return Request.postRequest("registerFour/getIdsOfList",search);
};

RegistrationFourService.getById = function (id) {
	return Request.getRequest(`registerFour/get/${id}`);
};


RegistrationFourService.update = function (id, data) {
	return Request.postRequest(`registerFour/update/${id}`, data);
};

RegistrationFourService.exportData = function (data) {
	return Request.postRequest("registerFour/export", data);
};

RegistrationFourService.exportMainSverka = function (data) {
	return Request.postRequest("registerFour/exportMainSverka", data);
};

RegistrationFourService.exportSverka = function (data) {
	return Request.postRequest("registerFour/exportSverka", data);
};

RegistrationFourService.migration = function (id) {
	return Request.getRequest(`registerFour/migrate/${id}`);
};

RegistrationFourService.saveNewReg = function (id, save_id) {
	return Request.getRequest(`registerFour/save/${id}?save_id=${save_id}`);
};	

RegistrationFourService.deployData = function (data) {
	return Request.postRequest("registerFour/deploy", data);
};

RegistrationFourService.fastAction = function (id, action) {
	return Request.postRequest(`registerFour/actionFast/${id}`, { type: action });
};

RegistrationFourService.delete = function (id) {
	return Request.deleteRequest(`registerFour/delete?id=${id}`);
};

RegistrationFourService.deleteAllTemporaryDataByFilter = function (search=null) {
	return Request.postRequest("registerFour/deleteAllTemporaryDataByFilter", search);
};


export default RegistrationFourService;