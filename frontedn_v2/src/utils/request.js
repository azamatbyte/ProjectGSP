import axios from "./baseUrl";

export default class Request {

    static getRequest = (url) => {
        return new Promise((resolve, reject) => {
            axios.get(url, {
            }).then(response => {
                resolve(response);
            }).catch(error => {
                reject(error);
            });
        });
    };

    static fileUpload = (url, data) => {
        const formData = new FormData();
        formData.append("file", data);
        return new Promise((resolve, reject) => {
            axios.post(
                url,
                formData,
                {
                    headers: {
                        "Content-Type": "multipart/form-data"
                    }
                }
            ).then((response) => {
                resolve(response);
            })
                .catch((error) => {
                    reject(error);
                });
        });
    };

    static deleteRequest = (url, data) => {
        return new Promise((resolve, reject) => {
            axios.delete(
                url,
                data
            ).then((response) => {
                resolve(response);
            })
                .catch((error) => {
                    reject(error);
                });
        });
    };

    static putRequest = (url, data) => {
        return new Promise((resolve, reject) => {
            axios.put(url, data)
                .then((response) => {
                    resolve(response);
                })
                .catch((error) => {
                    reject(error);
                });
        });
    };

    static postRequest = (url, data) => {
        return new Promise((resolve, reject) => {
            axios.post(
                url,
                data
            ).then((response) => {
                resolve(response);
            })
                .catch((error) => {
                    reject(error);
                });
        });
    };

    static postRequestBlob = (url, data) => {
        return new Promise((resolve, reject) => {
            axios.post(
                url,
                data,
                {
                    responseType: 'blob',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            ).then((response) => {
                resolve(response); // Return full response to access headers
            })
                .catch((error) => {
                    reject(error);
                });
        });
    };
}