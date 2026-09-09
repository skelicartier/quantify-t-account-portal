import "server-only";

import { AzureAuthClient } from "@/lib/azure-auth-client";
import { getAzureAuthConfig } from "@/lib/azure-auth-config";
import { isCredentialRejection } from "@/lib/auth/credential-errors";

/**
 * Build an Azure auth client that is completely isolated from the caller's session.
 *
 * Reauthentication has to prove the visitor knows their current password, and the
 * only way to do that is a password sign-in. Running that on the cookie-bound client
 * would overwrite the caller's session cookies. This client persists nothing and
 * writes no cookie, so nothing it issues is reachable after the request returns.
 */
export function createIsolatedAzureClient() {
  const config = getAzureAuthConfig();
  return new AzureAuthClient(config.apiUrl);
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
  let isolated: ReturnType<typeof createIsolatedAzureClient>;
  try {
    isolated = createIsolatedAzureClient();
  } catch {
    return "unavailable";
  }

  try {
    const result = await isolated.signIn(email, password);
    if (!result || !result.user) return "rejected";
    if (result.user.email?.toLowerCase() !== email) return "unavailable";
    return "verified";
  } catch (error) {
    return isCredentialRejection(error) ? "rejected" : "unavailable";
  }
}
