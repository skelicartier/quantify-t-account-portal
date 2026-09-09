/**
 * The single definition of "the provider positively rejected this credential".
 *
 * Two call sites need the same answer and must not drift: sign-in, which decides
 * between "those credentials are wrong" and "sign-in is unavailable", and
 * current-password reauthentication, which decides between refusing a security
 * change and failing it closed. Duplicating the set would let one path treat an
 * outage as a wrong password, or a wrong password as an outage.
 *
 * Classification is deliberately code-based only. An error without a machine-readable
 * code is not treated as a rejection: the fail-safe reading of an ambiguous provider
 * response is "unavailable" (retry later), never "your password is wrong" and never a
 * mutation that proceeds. The pinned client carries `code` on API errors it maps, so
 * the ordinary wrong-password case is classified precisely.
 */
export const CREDENTIAL_REJECTION_CODES: ReadonlySet<string> = new Set([
  "account_inactive",
  "email_not_confirmed",
  "invalid_credentials",
  "invalid_grant",
  "unauthenticated",
  "user_banned",
  "user_not_found",
]);

export function isCredentialRejection(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && CREDENTIAL_REJECTION_CODES.has(code);
}
