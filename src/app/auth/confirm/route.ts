import { parseAuthCallback, resolveTrustedAuthDestination } from "@/lib/auth/callback";
import {
  clearRecoveryAuthorization,
  issueRecoveryAuthorization,
} from "@/lib/auth/recovery-authorization";
import { getSupabasePublicConfiguration } from "@/lib/supabase/config";
import { clearPortalSupabaseAuthCookies, createServerSupabaseClient } from "@/lib/supabase/server";

const FAILURE_PATH = "/login?notice=invalid-auth-link";

function canonicalRedirect(siteUrl: string, path: string): Response {
  return Response.redirect(new URL(path, siteUrl), 303);
}

type ExchangedSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

async function clearRejectedExchange(supabase: ExchangedSupabaseClient): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Explicit browser-cookie cleanup below remains authoritative for this portal.
  }
  await Promise.allSettled([clearPortalSupabaseAuthCookies(), clearRecoveryAuthorization()]);
}

export async function GET(request: Request): Promise<Response> {
  const { siteUrl, cookieOptions } = getSupabasePublicConfiguration();
  const parsed = parseAuthCallback(new URL(request.url).searchParams);
  if (!parsed.success) return canonicalRedirect(siteUrl, FAILURE_PATH);

  let supabase: ExchangedSupabaseClient | null = null;
  try {
    supabase = await createServerSupabaseClient();
    const result = await supabase.auth.exchangeCodeForSession(parsed.data.code);
    if (result.error || !result.data.session || !result.data.user) {
      return canonicalRedirect(siteUrl, FAILURE_PATH);
    }

    const redirectType = "redirectType" in result.data ? result.data.redirectType : undefined;
    const destination = resolveTrustedAuthDestination(parsed.data.flow, redirectType);
    if (!destination) {
      await clearRejectedExchange(supabase);
      return canonicalRedirect(siteUrl, FAILURE_PATH);
    }

    if (destination === "/reset-password") {
      await issueRecoveryAuthorization({
        userId: result.data.user.id,
        accessToken: result.data.session.access_token,
        secure: cookieOptions.secure === true,
      });
    } else {
      await clearRecoveryAuthorization();
    }

    return canonicalRedirect(siteUrl, destination);
  } catch {
    if (supabase) await clearRejectedExchange(supabase);
    return canonicalRedirect(siteUrl, FAILURE_PATH);
  }
}
