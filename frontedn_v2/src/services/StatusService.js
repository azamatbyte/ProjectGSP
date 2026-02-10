import Request from "utils/request";

const StatusService = {};

StatusService.getList = function (pageNumber=1, pageSize=10,query="") {
	return Request.getRequest(`status/list?pageNumber=${pageNumber}&pageSize=${pageSize}&query=${query}`);
};

StatusService.create = function (values) {
	return Request.postRequest("status/create", values);
};

StatusService.listWithStatus = function (pageNumber=1, pageSize=10,query="") {
	return Request.getRequest(`status/listWithStatus?pageNumber=${pageNumber}&pageSize=${pageSize}`);
};

StatusService.statusChange = function (id, status) {
	return Request.getRequest(`status/changeStatus?accessStatusId=${id}&status=${status}`);

};
StatusService.getById = function (id) {
    return Request.getRequest(`status/getById/${id}`);
};

StatusService.update = function (id, data) {
	return Request.putRequest(`status/update/${id}`, data);
};

StatusService.deleteStatus = function (id) {
	return Request.deleteRequest(`status/delete/${id}`);
};

export default StatusService;