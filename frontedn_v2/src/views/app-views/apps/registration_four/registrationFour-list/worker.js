import RegistrationFourService from "services/RegistartionFourService";

// eslint-disable-next-line no-restricted-globals
self.onmessage = async ({ data: { formData } }) => {
  try {
    const uploadData = await RegistrationFourService.create(formData);
    const status = uploadData.status;
    const message =
      status === 200 ? "Data uploaded successfully" : "Upload failed";
    // eslint-disable-next-line no-restricted-globals
    self.postMessage({ status, message });
  } catch (error) {
    // eslint-disable-next-line no-restricted-globals
    self.postMessage({
      status: 500,
      message: `Error during upload: ${error.message}`,
    });
  }
};

