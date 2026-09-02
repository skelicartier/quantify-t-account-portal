import "server-only";

import { createClient } from "@supabase/supabase-js";

import { isCredentialRejection } from "@/lib/auth/credential-errors";
import { getSupabasePublicConfiguration } from "@/lib/supabase/config";

/**
 * Build a Supabase client that is completely isolated from the caller's session.
 *
 * Reauthentication has to prove the visitor knows their current password, and the
 * only publishable-key way to do that is a password sign-in. Running that on the
 * cookie-bound server client would overwrite the caller's session cookies and, if
 * the caller had already satisfied a TOTP challenge, silently downgrade a verified
 * AAL2 session back to AAL1. This client persists nothing, refreshes nothing, and
 * writes no cookie, so nothing it issues is reachable after the request returns.
 *
 * Each successful verification does mint a session provider-side, so it is signed out
 * again below. That is a real revocation, not just local cleanup: in the pinned client
 * `_signOut` posts `/logout?scope=<scope>` whenever a session is present, `local`
 * included. Only a failed revocation request would leave a refresh token alive until
 * expiry, and such a token is never written to a cookie, a log, or a store, so nothing
 * in the portal could reach it. `scope: "global"` is refused here on purpose: it would
 * sign the owner out of every device just for checking their password.
 */
export function createIsolatedSupabaseClient() {
  const { url, publishableKey } = getSupabasePublicConfiguration();

  return createClient(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
}

export type PasswordVerification = "verified" | "rejected" | "unavailable";

/**
 * Verify a current password without touching the caller's session.
 *
 * Returns "rejected" only when the provider positively rejects the credential, so
 * a transport failure can never be mistaken for a successful reauthentication.
 * The password is never logged, echoed, or returned.
 */
export async function verifyCurrentPassword(
  email: string,
  password: string,
): Promise<PasswordVerification> {
  let isolated: ReturnType<typeof createIsolatedSupabaseClient>;
  try {
    isolated = createIsolatedSupabaseClient();
  } catch {
    return "unavailable";
  }

  try {
    const { data, error } = await isolated.auth.signInWithPassword({ email, password });
    if (error) {
      // A positive credential rejection is the only "rejected" outcome; anything
      // else (rate limit, outage, misconfiguration) must fail closed as unavailable.
      return isCredentialRejection(error) ? "rejected" : "unavailable";
    }
    if (!data.session || data.user?.email?.toLowerCase() !== email) return "unavailable";
    return "verified";
  } catch {
    return "unavailable";
  } finally {
    // Revokes the session this verification created, provider-side and in memory.
    try {
      await isolated.auth.signOut({ scope: "local" });
    } catch {
      // Nothing to clean up when the sign-in never produced a session.
    }
  }
}
