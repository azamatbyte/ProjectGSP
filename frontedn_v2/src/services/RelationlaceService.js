
import Request from "utils/request";

const RelationService = {};

RelationService.getRelationList = function (pageNumber = 1, pageSize = 10, search = "") {
	return Request.getRequest(`relationdgr/list?pageNumber=${pageNumber}&pageSize=${pageSize}&query=${search}`);
};

RelationService.create = function (values) {
	return Request.postRequest("relationdgr/create", values);
};


RelationService.getById = function (id) {
	return Request.getRequest(`relationdgr/getById/${id}`);
};

RelationService.update = function (id, data) {
	return Request.putRequest(`relationdgr/update/${id}`, {new_name: data});
};

RelationService.deleteById = function (id) {
	return Request.deleteRequest(`relationdgr/delete/${id}`);
};

export default RelationService;