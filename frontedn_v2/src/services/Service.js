
import Request from "utils/request";

const Service = {};

Service.getServiceList = function (pageNumber = 1, pageSize = 10, query = "") {
	return Request.getRequest(`services/list?pageNumber=${pageNumber}&pageSize=${pageSize}&query=${query}`);
};

Service.create = function (data) {
	return Request.postRequest("relatives/create", data);
};

Service.delete = function (id) {
	return Request.deleteRequest(`relatives/delete/${id}`);
};

Service.addAdminService = function(adminId, serviceId) {
    return Request.postRequest("services/addAdmin", { adminId, serviceId });
};

Service.removeAdminService = function(adminId, serviceId) {
    return Request.deleteRequest(`services/rmAdmin?adminId=${adminId}&serviceId=${serviceId}`);
};

export default Service;