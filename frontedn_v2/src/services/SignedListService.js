import Request from "utils/request";

const SignedListService = {};


SignedListService.create = function (values) {
	return Request.postRequest("signlist/create", values);
};

SignedListService.getById = function (id) {
    return Request.getRequest(`signlist/getById/${id}`);
};

SignedListService.deleteById = function (id) {
    return Request.deleteRequest(`signlist/deleteById/${id}`);
};

SignedListService.getList = function (pageNumber=1, pageSize=10,query="",status="") {
	return Request.getRequest(`signlist/list?pageNumber=${pageNumber}&pageSize=${pageSize}&lastName=${query}&status=${status}`);
};

SignedListService.update = function (id, data) {
	return Request.putRequest(`signlist/update/${id}`, data);
};

SignedListService.statusChange = function (id, status) {
	return Request.postRequest(`signlist/changeStatus?id=${id}&status=${status}`);
};

export default SignedListService;