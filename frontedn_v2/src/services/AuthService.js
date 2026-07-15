import {
	auth_signin,
	auth_logout,
	auth_change_password,
	auth_reset_password,
	get_user,
} from "utils/api_urls";
import Request from "utils/request";

const AuthService = {};

AuthService.login = function (data) {
	return Request.postRequest(auth_signin, data);
};

// Changes the CURRENT user's password. The backend takes the target from the
// token, so this can only ever affect the logged-in account.
AuthService.changePassword = function (oldPassword, newPassword) {
	return Request.postRequest(auth_change_password, { oldPassword, newPassword });
};

// superAdmin-only recovery: set another admin's password without the old one.
AuthService.resetPassword = function (adminId, newPassword) {
	return Request.postRequest(auth_reset_password, { adminId, newPassword });
};

AuthService.logout = function (refreshToken) {
	return Request.postRequest(auth_logout, { refreshToken });
};

AuthService.getByToken = function () {
	return Request.postRequest(get_user);
};

AuthService.getList = function (pageNumber = 1, pageSize = 10, query = "", status = "", sortFields = []) {
	const sortParam = sortFields.length > 0 ? `&sort=${encodeURIComponent(JSON.stringify(sortFields))}` : "";
	return Request.getRequest(`auth/list?pageNumber=${pageNumber}&pageSize=${pageSize}&query=${query}&status=${status}${sortParam}`);
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
	return Request.postRequest(`auth/restore-from-zip`, data);
};

AuthService.backupPg = function () {
	return Request.postRequestBlob(`auth/backup-pg`, {});
};

AuthService.restorePg = function (data) {
	return Request.postRequest(`auth/restore-pg`, data);
};

export default AuthService;
