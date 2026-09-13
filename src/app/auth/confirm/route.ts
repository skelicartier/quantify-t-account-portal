import { desktopConnectReturnCookie, readDesktopConnectReturn } from "@/lib/auth/desktop-connect";
import { rateLimitWaitSeconds } from "@/lib/auth/rate-limit";
import { AzureAuthClient } from "@/lib/azure-auth-client";
import { getAzureAuthConfig } from "@/lib/azure-auth-config";

/**
 * On to the "you're verified" page. A desktop handoff remembered at sign-up rides along as
 * `next` and the cookie that carried it is spent, so the app the visitor started from can
 * be connected right after they sign in.
 */
function confirmedRedirect(request: Request, destination: URL): Response {
  const returnTo = readDesktopConnectReturn(request.headers.get("cookie"));
  if (!returnTo) return Response.redirect(destination, 303);
  destination.searchParams.set("next", returnTo);
  return new Response(null, {
    status: 303,
    headers: {
      Location: destination.toString(),
      "Set-Cookie": desktopConnectReturnCookie(null, { secure: destination.protocol === "https:" }),
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const tokens = new URL(request.url).searchParams.getAll("token");
  const token = tokens.length === 1 ? tokens[0]?.trim() : "";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://console.quantifyterminal.com";

  if (!token || token.length > 4_096) {
    return Response.redirect(new URL("/auth/confirmed?reason=invalid-confirm-link", siteUrl), 303);
  }

  try {
    const config = getAzureAuthConfig();
    await new AzureAuthClient(config.apiUrl).confirmEmail(token);
    return confirmedRedirect(request, new URL("/auth/confirmed", siteUrl));
  } catch (error) {
    // A refusal for presenting too many tokens is NOT an expired link, and must not be shown
    // as one: the invalid-link page tells the reader to go and get a new confirmation email,
    // which is the one action that makes their situation worse. Their link is probably fine
    // and waiting is all it needs.
    if (rateLimitWaitSeconds(error) !== null) {
      return Response.redirect(new URL("/auth/confirmed?reason=too-many-attempts", siteUrl), 303);
    }
  }

  // The same generic page for an expired, reused or forged token.
  return Response.redirect(new URL("/auth/confirmed?reason=invalid-confirm-link", siteUrl), 303);
}
