import { parseAuthCallback, resolveTrustedAuthDestination } from "@/lib/auth/callback";
import { getAzureAuthConfig } from "@/lib/azure-auth-config";

const FAILURE_PATH = "/login?notice=invalid-auth-link";

function canonicalRedirect(siteUrl: string, path: string): Response {
  return Response.redirect(new URL(path, siteUrl), 303);
}

export async function GET(request: Request): Promise<Response> {
  const config = getAzureAuthConfig();
  const parsed = parseAuthCallback(new URL(request.url).searchParams);
  
  // For now, redirect to login since we're not using Supabase OAuth anymore
  // This route would need to be reimplemented if OAuth is needed with Azure
  return canonicalRedirect(config.apiUrl, FAILURE_PATH);
}
