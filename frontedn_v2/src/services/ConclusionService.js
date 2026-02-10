import Request from "utils/request";

const ConclusionService = {};

// List conclusions with optional pagination and name filter
ConclusionService.getList = function(pageNumber = 1, pageSize = 10, name = "") {
	return Request.getRequest(`conclusion/list?pageNumber=${pageNumber}&pageSize=${pageSize}&name=${encodeURIComponent(name)}`);
};

// Create conclusion
ConclusionService.create = function(values) {
	return Request.postRequest("conclusion/create", values);
};

// Get by id
ConclusionService.getById = function(id) {
	return Request.getRequest(`conclusion/get/${id}`);
};

// Update conclusion (API expects POST /conclusion/update with id in body)
ConclusionService.update = function(values) {
	return Request.postRequest("conclusion/update", values);
};

export default ConclusionService;
