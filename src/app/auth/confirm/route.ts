import { AzureAuthClient } from "@/lib/azure-auth-client";
import { getAzureAuthConfig } from "@/lib/azure-auth-config";

export async function GET(request: Request): Promise<Response> {
  const tokens = new URL(request.url).searchParams.getAll("token");
  const token = tokens.length === 1 ? tokens[0]?.trim() : "";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://console.quantifyterminal.com";

  if (!token || token.length > 4_096) {
    return Response.redirect(new URL("/login?notice=invalid-confirm-link", siteUrl), 303);
  }

  try {
    const config = getAzureAuthConfig();
    await new AzureAuthClient(config.apiUrl).confirmEmail(token);
    return Response.redirect(new URL("/login?notice=email-confirmed", siteUrl), 303);
  } catch {}

  return Response.redirect(new URL("/login?notice=invalid-confirm-link", siteUrl), 303);
}
