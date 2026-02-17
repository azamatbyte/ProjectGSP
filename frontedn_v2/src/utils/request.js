import axios from "./baseUrl";

export default class Request {

    static getRequest = (url) => axios.get(url);

    static fileUpload = (url, data) => {
        const formData = new FormData();
        formData.append("file", data);
        return axios.post(url, formData, {
            headers: {
                "Content-Type": "multipart/form-data"
            }
        });
    };

    static deleteRequest = (url, data) => axios.delete(url, data);

    static putRequest = (url, data) => axios.put(url, data);

    static postRequest = (url, data) => axios.post(url, data);

    static postRequestBlob = (url, data) => axios.post(url, data, {
        responseType: 'blob',
        headers: {
            'Content-Type': 'application/json'
        }
    });
}