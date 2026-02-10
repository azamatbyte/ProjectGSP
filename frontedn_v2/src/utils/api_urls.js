// In production, the backend serves the frontend on the same origin,
// so we use an empty string (relative URL). The .env file is only used in development.
// This ensures API calls work correctly regardless of which port the backend runs on.
export const host = process.env.REACT_APP_SITE_BACKEND || "";

export const teacher_signin = "teachers/signin";
export const refresh_token = "auth/refreshToken";
export const auth_signin = "auth/signin";
export const get_user = "auth/me";
export const teachers = "/teachers";
export const students = "/students";
export const courses = "/courses";
export const groups = "/groups";
export const payment = "/payment";
export const get_user_by_id = "auth/getById";
