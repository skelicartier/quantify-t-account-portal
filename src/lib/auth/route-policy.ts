import { isDesktopConnectPath } from "@/lib/auth/desktop-connect";

export function isProtectedAccountPath(pathname: string): boolean {
  return pathname === "/account" || pathname.startsWith("/account/");
}

/** Paths that require a session: the console itself and the desktop handoff page. */
export function isProtectedPortalPath(pathname: string): boolean {
  return isProtectedAccountPath(pathname) || isDesktopConnectPath(pathname);
}

export function buildLoginRedirectUrl(requestUrl: URL): URL {
  const destination = new URL("/login", requestUrl.origin);
  if (isProtectedPortalPath(requestUrl.pathname)) {
    destination.searchParams.set("next", `${requestUrl.pathname}${requestUrl.search}`);
  }
  return destination;
}
