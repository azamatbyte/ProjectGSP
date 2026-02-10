import Request from "utils/request";

const InitiatorService = {};

InitiatorService.getList = function (pageNumber=1, pageSize=10,query="") {
	return Request.getRequest(`initiator/list?pageNumber=${pageNumber}&pageSize=${pageSize}&query=${query}`);
};

InitiatorService.create = function (values) {
	return Request.postRequest("initiator/create", values);
};

InitiatorService.getById = function (id) {
    return Request.getRequest(`initiator/getById?id=${id}`);
};

InitiatorService.update = function (id, data) {
	return Request.putRequest(`initiator/update/${id}`, data);
};

InitiatorService.deleteById = function (id) {
    return Request.deleteRequest(`initiator/delete/${id}`);
};

export default InitiatorService;