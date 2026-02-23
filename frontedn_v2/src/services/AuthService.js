import { auth_signin, auth_logout, get_user } from "utils/api_urls";
import Request from "utils/request";

const AuthService = {};

AuthService.login = function (data) {
	return Request.postRequest(auth_signin, data);
};

AuthService.logout = function (refreshToken) {
	return Request.postRequest(auth_logout, { refreshToken });
};

AuthService.getByToken = function () {
	return Request.postRequest(get_user);
};

AuthService.getList = function (pageNumber = 1, pageSize = 10, query = "", status = "") {
	return Request.getRequest(`auth/list?pageNumber=${pageNumber}&pageSize=${pageSize}&query=${query}&status=${status}`);
};

AuthService.create = function (data) {
	return Request.postRequest("auth/signup", data);
};

AuthService.updateUser = function (data) {
	return Request.putRequest("auth/update", data);
};

AuthService.statusChange = function (id, status) {
	return Request.putRequest(`auth/changeStatus?adminId=${id}&status=${status}`);
};

AuthService.checkUsername = function (username) {
	return Request.getRequest(`auth/checkUsername?username=${username}`);
};
AuthService.checkUsernameUpdate = function (username, id) {
	return Request.getRequest(`auth/checkUsernameUpdate?username=${username}&&id=${id}`);
};
AuthService.update = function (id, data) {
	return Request.putRequest(`auth/update?adminId=${id}`, data);
};

AuthService.getById = function (id) {
	return Request.getRequest(`auth/getById?id=${id}`);
};

AuthService.deleteById = function (id) {
	return Request.deleteRequest(`auth/deleteById?id=${id}`);
};

AuthService.getAdminSessions = function (id, pageNumber = 1, pageSize = 10) {
	return Request.getRequest(`auth/getAdminSessions/${id}?pageNumber=${pageNumber}&pageSize=${pageSize}`);
};

AuthService.getAdminServices = function (id, pageNumber = 1, pageSize = 10) {
	return Request.getRequest(`auth/getAdminServices/${id}?pageNumber=${pageNumber}&pageSize=${pageSize}`);
};

AuthService.backup = function (data) {
	return Request.postRequestBlob(`auth/backup`, data);
};

AuthService.restoreFromZip = function (data) {
	return Request.postRequestBlob(`auth/restore-from-zip`, data);
};

export default AuthService;
