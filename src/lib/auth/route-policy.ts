import { isDesktopConnectPath } from "@/lib/auth/desktop-connect";

export function isProtectedAccountPath(pathname: string): boolean {
  return pathname === "/account" || pathname.startsWith("/account/");
}

export function isProtectedAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** The page a signed-in session confirms its passkey on. It needs the session to exist. */
export function isPasskeyChallengePath(pathname: string): boolean {
  return pathname === "/passkey" || pathname.startsWith("/passkey/");
}

/** Paths that require a session: the console itself, its passkey door and the desktop handoff page. */
export function isProtectedPortalPath(pathname: string): boolean {
  return (
    isProtectedAccountPath(pathname) ||
    isProtectedAdminPath(pathname) ||
    isPasskeyChallengePath(pathname) ||
    isDesktopConnectPath(pathname)
  );
}

export function buildLoginRedirectUrl(requestUrl: URL): URL {
  const destination = new URL("/login", requestUrl.origin);
  if (isProtectedPortalPath(requestUrl.pathname)) {
    destination.searchParams.set("next", `${requestUrl.pathname}${requestUrl.search}`);
  }
  return destination;
}
