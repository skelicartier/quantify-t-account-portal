import { NextResponse, type NextRequest } from "next/server";

import { AzureAuthClient } from "@/lib/azure-auth-client";
import { getAzureAuthConfig } from "@/lib/azure-auth-config";

export type RefreshedSession = {
  response: NextResponse;
  user: { id: string; email: string } | null;
};

export async function updateSession(
  request: NextRequest,
): Promise<RefreshedSession> {
  const response = NextResponse.next({ request });
  const config = getAzureAuthConfig();

  // Get access token from cookies
  const accessToken = request.cookies.get(config.cookieName)?.value;
  const refreshToken = request.cookies.get(config.refreshTokenName)?.value;

  if (!accessToken) {
    return { response, user: null };
  }

  try {
    const client = new AzureAuthClient(config.apiUrl);
    const user = await client.getUser(accessToken);
    return { response, user: user ? { id: user.id, email: user.email } : null };
  } catch {
    // Token might be expired, try refresh
    if (refreshToken) {
      try {
        const client = new AzureAuthClient(config.apiUrl);
        const newSession = await client.refreshSession(accessToken, refreshToken);
        
        // Update cookies with new tokens
        response.cookies.set(config.cookieName, newSession.access_token, {
          ...config.cookieOptions,
          maxAge: newSession.expires_in,
        });
        response.cookies.set(config.refreshTokenName, newSession.refresh_token, config.cookieOptions);

        const user = await client.getUser(newSession.access_token);
        return { response, user: user ? { id: user.id, email: user.email } : null };
      } catch {
        return { response, user: null };
      }
    }
    return { response, user: null };
  }
}

export function copyResponseCookies(source: NextResponse, target: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}
