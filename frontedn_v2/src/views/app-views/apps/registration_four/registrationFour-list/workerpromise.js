const uploadDataWorker = new Worker(new URL("./fileuploadworker.js", import.meta.url));

export default function uploadData(data) {
  return new Promise((resolve, reject) => {
    uploadDataWorker.onmessage = ({ data: response }) => {
      resolve(response);
    };
    uploadDataWorker.onerror = error => {
      reject(error);
    };
    uploadDataWorker.postMessage(data);
  });
}

