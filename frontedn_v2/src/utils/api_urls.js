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

// The dev config points at localhost, but when the page is opened from another
// machine on the LAN, "localhost" would be the visitor's own machine — swap in
// the hostname the page was actually served from, keeping the configured port.
function adaptHostForLan(baseUrl) {
  if (!baseUrl || typeof window === "undefined") {
    return baseUrl;
  }
  try {
    const url = new URL(baseUrl);
    const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
    if (loopback.has(url.hostname) && !loopback.has(window.location.hostname)) {
      url.hostname = window.location.hostname;
      return url.origin;
    }
  } catch {
    // Not an absolute URL — fall through to the configured value.
  }
  return baseUrl;
}

// Production defaults to same-origin requests, but runtime config can point the
// browser to another backend without rebuilding the bundle.
export const host = adaptHostForLan(
  normalizeBaseUrl(runtimeConfig.apiBaseUrl) ||
    normalizeBaseUrl(process.env.REACT_APP_SITE_BACKEND) ||
    ""
);

export const apiBaseUrl = host ? `${host}/api/v1/` : "/api/v1/";
export const shouldLogApiBaseUrl =
  process.env.NODE_ENV !== "production" ||
  runtimeConfig.debugApiResolution === true;

export const teacher_signin = "teachers/signin";
export const refresh_token = "auth/refreshToken";
export const auth_signin = "auth/signin";
export const auth_logout = "auth/logout";
export const auth_change_password = "auth/changePassword";
export const auth_reset_password = "auth/resetPassword";
export const get_user = "auth/me";
export const teachers = "/teachers";
export const students = "/students";
export const courses = "/courses";
export const groups = "/groups";
export const payment = "/payment";
export const get_user_by_id = "auth/getById";
