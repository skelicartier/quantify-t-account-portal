import { NextResponse, type NextRequest } from "next/server";

import { AzureAuthClient, AzureAuthError } from "@/lib/azure-auth-client";
import { getAzureAuthConfig } from "@/lib/azure-auth-config";

export type RefreshedSession = {
  response: NextResponse;
  user: { id: string; email: string } | null;
};

export async function updateSession(request: NextRequest): Promise<RefreshedSession> {
  const response = NextResponse.next({ request });
  const config = getAzureAuthConfig();

  function clearAuthCookies(): void {
    response.cookies.set(config.cookieName, "", { ...config.cookieOptions, maxAge: 0 });
    response.cookies.set(config.refreshTokenName, "", { ...config.cookieOptions, maxAge: 0 });
  }

  // Get access token from cookies
  const accessToken = request.cookies.get(config.cookieName)?.value;
  const refreshToken = request.cookies.get(config.refreshTokenName)?.value;

  if (!accessToken && !refreshToken) {
    return { response, user: null };
  }

  async function refreshUser(client: AzureAuthClient): Promise<RefreshedSession> {
    if (!refreshToken) {
      clearAuthCookies();
      return { response, user: null };
    }
    try {
      const newSession = await client.refreshSession(accessToken ?? null, refreshToken);

      response.cookies.set(config.cookieName, newSession.access_token, {
        ...config.cookieOptions,
        maxAge: newSession.expires_in,
      });
      response.cookies.set(config.refreshTokenName, newSession.refresh_token, config.cookieOptions);

      const user = await client.getUser(newSession.access_token);
      return { response, user: user ? { id: user.id, email: user.email } : null };
    } catch (error) {
      // A refused refresh is a sign-out. An unreachable service is not.
      //
      // This used to be a bare `catch` that cleared the cookies on ANY failure, so a
      // momentary 5xx or a dropped connection to the Account API logged every console user
      // out and made them type their password again — for an outage that had nothing to do
      // with their session. The desktop already draws this distinction in
      // `_account_api_context_for_user`: "a refused refresh clears the stored session; an
      // unreachable service keeps it, because an offline moment is not a sign-out."
      //
      // The session is left intact on an outage. It is already expired or near it, so the
      // next request retries the refresh; nothing is granted by keeping a cookie whose
      // token the service will reject anyway.
      if (isSessionRefusal(error)) clearAuthCookies();
      return { response, user: null };
    }
  }

  try {
    const client = new AzureAuthClient(config.apiUrl);
    if (!accessToken) return await refreshUser(client);
    const user = await client.getUser(accessToken);
    return { response, user: user ? { id: user.id, email: user.email } : null };
  } catch {
    return await refreshUser(new AzureAuthClient(config.apiUrl));
  }
}

/**
 * Whether this failure means the session is genuinely over.
 *
 * 401 and 403 are the service saying no to this token. Everything else — a 5xx, a timeout, a
 * DNS failure, a response that was not JSON — is the service failing to answer, which says
 * nothing about whether the session is still valid.
 */
export function isSessionRefusal(error: unknown): boolean {
  if (!(error instanceof AzureAuthError)) return false;
  return error.status === 401 || error.status === 403;
}

export function copyResponseCookies(source: NextResponse, target: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}
