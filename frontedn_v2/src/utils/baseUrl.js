import axios from "axios/dist/axios";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { getStorage, getStorageR, setStorage, setStorageR, clearStorage } from "./storage";
import Request  from "./request";
import { apiBaseUrl, refresh_token, shouldLogApiBaseUrl } from "./api_urls";

// Enable UTC plugin for dayjs
dayjs.extend(utc);

if (shouldLogApiBaseUrl) {
  console.info(`[API] Base URL: ${apiBaseUrl}`);
}

const instance = axios.create({
  baseURL: apiBaseUrl,
});

instance.interceptors.request.use(
  (config) => {
    // Globally normalize Date/Dayjs values before sending to API
    const isFormData = typeof FormData !== "undefined" && config.data instanceof FormData;
    const isMultipart = (config.headers?.["X-Backup-Password"] || config.headers?.["Content-Type"] || config.headers?.["content-type"])?.toString().includes("multipart/form-data");

    const shouldTransformBody = !isFormData && !isMultipart && config.data && typeof config.data === "object" && !Array.isArray(config.data);

    const serialize = (val) => {
      if (val == null) return val;
      // Dayjs instance
      if (dayjs.isDayjs && dayjs.isDayjs(val)) {
        // Send ISO-8601 with UTC timezone: YYYY-MM-DDTHH:mm:ss.SSSZ
        return val.toISOString();
      }
      // Native Date
      if (val instanceof Date) {
        // Use native toISOString() which gives UTC with 'Z' suffix
        return val.toISOString();
      }
      if (Array.isArray(val)) {
        return val.map((v) => serialize(v));
      }
      if (typeof val === "object") {
        const out = {};
        for (const k in val) {
          if (Object.prototype.hasOwnProperty.call(val, k)) {
            out[k] = serialize(val[k]);
          }
        }
        return out;
      }
      return val;
    };

    if (shouldTransformBody) {
      config.data = serialize(config.data);
    }
    if (config.params && typeof config.params === "object") {
      config.params = serialize(config.params);
    }

    const token = getStorage();
    if (token) {
      // config.headers.Authorization = `Bearer ${token}`;
      config.headers["x-access-token"] = `${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);


let refreshPromise = null;

instance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if ((error?.response?.statusText === "Unauthorized" || error?.response?.status === 401) && !originalRequest._retry) {
      originalRequest._retry = true;

      if (!refreshPromise) {
        refreshPromise = Request.postRequest(refresh_token, { refreshToken: getStorageR() })
          .then((response) => {
            const { accessToken, refreshToken } = response.data;
            setStorage(accessToken);
            setStorageR(refreshToken);
            return accessToken;
          })
          .catch((err) => {
            err.toLogin = true;
            if (err?.response?.status === 403) {
              clearStorage();
              localStorage.removeItem("AUTH_TOKEN");
              window.location.href = "/auth/login?redirect=/app/dashboards/default";
            }
            throw err;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }

      try {
        const newToken = await refreshPromise;
        originalRequest.headers["x-access-token"] = `${newToken}`;
        return axios(originalRequest);
      } catch (err) {
        return Promise.reject(err);
      }
    }

    if (error?.response?.status === 403) {
      clearStorage();
      localStorage.removeItem("AUTH_TOKEN");
      window.location.href = "/auth/login?redirect=/app/dashboards/default";
    }

    return Promise.reject(error);
  }
);

export default instance;
