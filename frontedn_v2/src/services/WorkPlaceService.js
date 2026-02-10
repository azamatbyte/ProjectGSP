
import Request from "utils/request";

const WorkPlaceService = {};

WorkPlaceService.getList = function (pageNumber=1, pageSize=10,query="") {
	return Request.getRequest(`workplaces/list?pageNumber=${pageNumber}&pageSize=${pageSize}&query=${query}`);
};

WorkPlaceService.createWorkplace = function (data) {
	return Request.postRequest("workplaces/create", data);
};

WorkPlaceService.updateWorkplace = function (id, data) {
	return Request.putRequest(`workplaces/update?id=${id}&new_name=${data}`);
};

WorkPlaceService.getById = function (id) {
    return Request.getRequest(`workplaces/getById/${id}`);
};

WorkPlaceService.deleteById = function (id) {
    return Request.deleteRequest(`workplaces/delete/${id}`);
};

WorkPlaceService.listByRegistration = function (pageNumber=1, pageSize=10,query="") {
	return Request.getRequest(`workplaces/listByRegistration?pageNumber=${pageNumber}&pageSize=${pageSize}&name=${query}`);
};

export default WorkPlaceService;