import Request from "utils/request";

const RelativeService = {};

RelativeService.create = function (data) {
	return Request.postRequest("relatives/create", data);
};

RelativeService.delete = function (id) {
	return Request.deleteRequest(`relatives/delete/${id}`);
};

RelativeService.getList = function (pageNumber=1, pageSize=10,search=null) {
	return Request.postRequest(`relatives/list?pageNumber=${pageNumber}&pageSize=${pageSize}`,search);
};

RelativeService.searchByRegistrationId = function (registrationId,pageNumber=1, pageSize=10) {
	return Request.getRequest(`relatives/search?registrationId=${registrationId}&&pageNumber=${pageNumber}&&pageSize=${pageSize}`);
};

RelativeService.getById = function (id) {
	return Request.getRequest(`relatives/getById/${id}`);
};

RelativeService.list_by_registrationId = function (pageNumber=1, pageSize=10,id,model,data={}) {
	return Request.postRequest(`relatives/list_by_registrationId?registrationId=${id}&pageNumber=${pageNumber}&pageSize=${pageSize}&model=${model}`,data);
};
RelativeService.update = function (id, data) {
	return Request.putRequest(`relatives/update/${id}`, data);
};

RelativeService.byRegistrationId = function (id, type) {
	return Request.getRequest(`relatives/byRegistrationId/${id}?type=${type}`);
};

RelativeService.allByRegistrationId = function (id, type) {
	return Request.getRequest(`relatives/allByRegistrationId/${id}?type=${type}`);
};

RelativeService.duplicate = function (id) {
	return Request.postRequest(`relatives/duplicate/${id}`);
};


RelativeService.addRelativesBySession = function (data) {
	return Request.postRequest("relatives/addRelativesBySession",data);
};


export default RelativeService;