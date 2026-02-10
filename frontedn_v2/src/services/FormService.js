import Request from "utils/request";

const FormService = {};

FormService.getList = function (pageNumber = 1, pageSize = 10, query = "") {
	return Request.getRequest(`forms/list?pageNumber=${pageNumber}&pageSize=${pageSize}&query=${query}`);
};

FormService.listWithStatus = function (pageNumber = 1, pageSize = 10, query = "",type="") {
	return Request.getRequest(`forms/listWithStatus?pageNumber=${pageNumber}&pageSize=${pageSize}&query=${query}&type=${type}`);
};


FormService.statusChange = function (id, status) {
	return Request.getRequest(`forms/changeStatus?formId=${id}&status=${status}`);
};

FormService.create = function (values) {
	return Request.postRequest("forms/create", values);
};

FormService.getById = function (id) {
	return Request.getRequest(`forms/getById/${id}`);
};

FormService.update = function (id, data) {
	return Request.putRequest(`forms/update/${id}`, data);
};

FormService.getLogList = function (tableName, id,field, pageNumber = 1, pageSize = 10) {
	return Request.getRequest(`logs/list?recordId=${id}&tableName=${tableName}&field=${field}&pageNumber=${pageNumber}&pageSize=${pageSize}`);
};

export default FormService;