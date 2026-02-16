export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const getLoginUrl = () => {
  const url = new URL("/api/auth/dev-login", window.location.origin);
  url.searchParams.set("redirect", "/admin");
  return url.toString();
};

