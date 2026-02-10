import Request from "utils/request";

const RaportTypesService = {};

RaportTypesService.create = function (data) {
  return Request.postRequest("raport/type/create", data);
};

RaportTypesService.list = function (pageNumber=1, pageSize=10, search="") {
  return Request.postRequest(
    `raport/type/list?pageNumber=${pageNumber}&pageSize=${pageSize}`,
    { searchQuery: search }
  );
};

RaportTypesService.update = function (id, data) {
  return Request.postRequest(`raport/type/update/${id}`, data);
};

RaportTypesService.getById = function (id) {
  return Request.getRequest(`raport/type/get/${id}`);
};

export default RaportTypesService;
