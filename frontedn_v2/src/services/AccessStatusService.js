import Request from "utils/request";

const AccessStatusService = {};

AccessStatusService.getList = function (pageNumber=1, pageSize=10,query="") {
	return Request.getRequest(`status/list?pageNumber=${pageNumber}&pageSize=${pageSize}`);
};

AccessStatusService.listWithStatus = function (pageNumber=1, pageSize=10,query="") {
	return Request.getRequest(`status/listWithStatus?pageNumber=${pageNumber}&pageSize=${pageSize}&query=${query}`);
};

AccessStatusService.statusChange = function (id, status) {
	return Request.getRequest(`status/changeStatus?statusId=${id}&status=${status}`);
};

AccessStatusService.create = function (values) {
	return Request.postRequest("status/create", values);
};

AccessStatusService.getById = function (id) {
    return Request.getRequest(`status/getById/${id}`);
};

AccessStatusService.update = function (id, data) {
	return Request.putRequest(`status/update/${id}`, data);
};

export default AccessStatusService;