export const getStorage = () => {
    return window.localStorage.getItem("emilus_access_token");
};

export const setStorage = (token) => {
    window.localStorage.setItem("emilus_access_token", token);
};

export const getStorageR = () => {
    return window.localStorage.getItem("emilus_refresh_token");
};

export const setStorageR = (token) => {
    window.localStorage.setItem("emilus_refresh_token", token);
};

export const clearStorage = () => {
    window.localStorage.removeItem("emilus_access_token");
    window.localStorage.removeItem("emilus_refresh_token");
};