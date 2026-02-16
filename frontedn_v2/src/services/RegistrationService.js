
import Request from "utils/request";

const RegistrationService = {};

RegistrationService.create = function (data) {
	return Request.postRequest("register/create", data);
};

RegistrationService.getList = function (pageNumber=1, pageSize=10, model,search=null,sort) {
	return Request.postRequest(`register/list?pageNumber=${pageNumber}&pageSize=${pageSize}`,{...search,model:model,data:sort});
};

RegistrationService.getById = function (id) {
	return Request.getRequest(`register/get/${id}`);
};


RegistrationService.getProverka = function (id) {
	return Request.getRequest(`register/getProverka/${id}`);
};

RegistrationService.updateRegNumber = function (id, data) {
	return Request.postRequest(`register/updateregnumber/${id}`, data);
};

RegistrationService.checkRegNumber = function (value, id) {
	return Request.getRequest(`register/checkregnumber?regNumber=${value}&id=${id}`);
};

RegistrationService.deleteById = function (id) {
    return Request.deleteRequest(`register/delete/${id}`);
};

RegistrationService.update = function (id, data) {
	return Request.postRequest(`register/update/${id}`, data);
};

RegistrationService.updateStatusAll = function (data) {
	return Request.postRequest(`register/updateStatusAll`, data);
};

RegistrationService.getLogList = function (data) {
	return Request.postRequest("register/logs", data);
};

RegistrationService.getListByGlobalSearch = function (pageNumber=1, pageSize=10, search=null, sortField=null, sortOrder=null) {
	const body = { ...search };
	if (sortField) body.sortField = sortField;
	if (sortOrder) body.sortOrder = sortOrder;
	return Request.postRequest(`register/globalSearch?pageNumber=${pageNumber}&pageSize=${pageSize}`, body);
};

RegistrationService.getListByGlobalSearchCount = function (search=null) {
	return Request.postRequest("register/globalSearchCount", search);
};

RegistrationService.getByIds = function (search) {
	return Request.postRequest("register/getByIds", search);
};

RegistrationService.delete = function (id) {
	return Request.deleteRequest(`register/delete/${id}`);
};


export default RegistrationService;