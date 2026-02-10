import Request from "utils/request";

const SessionService = {};


SessionService.create = function (registrationId=null,type="SESSION") {
	return Request.postRequest("session/create", {registrationId,type});
};

SessionService.listSessions = function (pageNumber=1, pageSize=10,type="SESSION") {
	return Request.getRequest(`session/list?pageNumber=${pageNumber}&pageSize=${pageSize}&type=${type}`);
};

SessionService.addRelatives = function (data) {
	return Request.postRequest("session/addRelatives",data);
};

SessionService.clear = function (type="SESSION") {
	return Request.postRequest("session/clear",{type});
};

SessionService.count = function (type="SESSION") {
	return Request.getRequest(`session/count?type=${type}`);
};

SessionService.swapSessions = function (type="SESSION",activeIndex="",overIndex="") {
	return Request.postRequest("session/swap", {type,activeIndex,overIndex});
};

SessionService.deleteSession = function (id="") {
	return Request.deleteRequest(`session/delete/${id}`);
};

export default SessionService;