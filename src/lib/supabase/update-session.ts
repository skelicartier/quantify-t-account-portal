import { NextResponse, type NextRequest } from "next/server";

import { AzureAuthClient } from "@/lib/azure-auth-client";
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
    } catch {
      clearAuthCookies();
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

export function copyResponseCookies(source: NextResponse, target: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}
