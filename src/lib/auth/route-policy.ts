export function isProtectedAccountPath(pathname: string): boolean {
  return pathname === "/account" || pathname.startsWith("/account/");
}

export function buildLoginRedirectUrl(requestUrl: URL): URL {
  const destination = new URL("/login", requestUrl.origin);
  if (isProtectedAccountPath(requestUrl.pathname)) {
    destination.searchParams.set("next", `${requestUrl.pathname}${requestUrl.search}`);
  }
  return destination;
}
