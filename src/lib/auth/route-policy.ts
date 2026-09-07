export function isProtectedAccountPath(pathname: string): boolean {
  return pathname === "/account" || pathname.startsWith("/account/");
}

export function isProtectedAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function isProtectedPortalPath(pathname: string): boolean {
  return isProtectedAccountPath(pathname) || isProtectedAdminPath(pathname);
}

export function buildLoginRedirectUrl(requestUrl: URL): URL {
  const destination = new URL("/login", requestUrl.origin);
  if (isProtectedPortalPath(requestUrl.pathname)) {
    destination.searchParams.set("next", `${requestUrl.pathname}${requestUrl.search}`);
  }
  return destination;
}
