export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
/** Session token lifetime — 7 days. Used for login cookies and JWT expiry. */
export const SESSION_EXPIRY_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
