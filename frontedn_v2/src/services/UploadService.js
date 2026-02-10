import Request from "utils/request";

const UploadService = {};

UploadService.uploadImage = async function (data) {
    return Request.fileUpload("upload", data);
};

UploadService.postImage = async function (data) {
    return Request.postRequest("upload", data);
};

export default UploadService;
