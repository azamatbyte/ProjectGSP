function normalizeBaseUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || trimmed === "/") {
    return "";
  }

  return trimmed.replace(/\/+$/, "");
}

const runtimeConfig =
  typeof window !== "undefined" && window.__GSP_RUNTIME_CONFIG__
    ? window.__GSP_RUNTIME_CONFIG__
    : {};

// Production defaults to same-origin requests, but runtime config can point the
// browser to another backend without rebuilding the bundle.
export const host =
  normalizeBaseUrl(runtimeConfig.apiBaseUrl) ||
  normalizeBaseUrl(process.env.REACT_APP_SITE_BACKEND) ||
  "";

export const apiBaseUrl = host ? `${host}/api/v1/` : "/api/v1/";
export const shouldLogApiBaseUrl =
  process.env.NODE_ENV !== "production" ||
  runtimeConfig.debugApiResolution === true;

export const teacher_signin = "teachers/signin";
export const refresh_token = "auth/refreshToken";
export const auth_signin = "auth/signin";
export const auth_logout = "auth/logout";
export const get_user = "auth/me";
export const teachers = "/teachers";
export const students = "/students";
export const courses = "/courses";
export const groups = "/groups";
export const payment = "/payment";
export const get_user_by_id = "auth/getById";
