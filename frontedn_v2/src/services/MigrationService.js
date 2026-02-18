import Request from "utils/request";

const MigrationService = {};

MigrationService.uploadMigration = function (file) {
    return Request.fileUpload("migration/upload-modal", file);
};

MigrationService.getMigrationStatus = function () {
    return Request.getRequest("migration/status");
};

export default MigrationService;
