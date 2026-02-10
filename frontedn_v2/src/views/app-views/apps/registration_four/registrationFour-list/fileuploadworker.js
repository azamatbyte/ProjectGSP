const { default: RegistrationFourService } = require("services/RegistartionFourService");

onmessage = async function (e) {
    try {
        const data = e.data;
        const uploadData = await RegistrationFourService.create(data);
        const status = uploadData.status;
        const message =
            status === 200 ? "Data uploaded successfully" : "Upload failed";
        postMessage({ status, message });
    } catch (error) {
        postMessage({
            status: 500,
            message: `Error during upload: ${error.message}`,
        });
    }
};
