export type AuthCallbackFlow = "signup" | "recovery" | "email-change";
export type AuthCallbackDestination =
  "/account" | "/reset-password" | "/account/security?notice=email-change-confirmed";

const MAX_CALLBACK_CODE_LENGTH = 4_096;

export type ParsedAuthCallback =
  | {
      success: true;
      data: {
        code: string;
        flow: AuthCallbackFlow;
      };
    }
  | { success: false };

function isAuthCallbackFlow(value: string): value is AuthCallbackFlow {
  return value === "signup" || value === "recovery" || value === "email-change";
}

export function parseAuthCallback(parameters: URLSearchParams): ParsedAuthCallback {
  const codes = parameters.getAll("code");
  const flows = parameters.getAll("flow");
  if (codes.length !== 1 || flows.length !== 1) return { success: false };
  if (parameters.has("token_hash") || parameters.has("type")) return { success: false };

  const code = codes[0];
  const flow = flows[0];
  if (
    code === undefined ||
    flow === undefined ||
    code.length === 0 ||
    code.length > MAX_CALLBACK_CODE_LENGTH ||
    code !== code.trim() ||
    !isAuthCallbackFlow(flow)
  ) {
    return { success: false };
  }

  return {
    success: true,
    data: { code, flow },
  };
}

/**
 * The trust boundary for callback destinations.
 *
 * `redirectType` is produced by the exchange, never by the query string, and each
 * flow accepts exactly one provider value. Anything else returns null so the caller
 * fails closed to the generic invalid-link notice.
 *
 * In the legacy PKCE flow this value was two-valued: password recovery exchanged as
 * `"recovery"`, while signup and email-change exchanged as `null`. The Azure token
 * confirmation route does not use this helper for new links, but the policy remains
 * fail-closed while older references are retired.
 *
 * Binding two flows to the same value costs nothing that matters here. `null` cannot
 * reach `/reset-password`, which is the only destination that authorizes a password
 * change without the current password, and `"recovery"` cannot reach the account or
 * security destinations. A signup link presented as `flow=email-change` lands on the
 * security page behind the same account guard and shows a notice the visitor can
 * verify against the address on that page; it grants nothing extra.
 */
export function resolveTrustedAuthDestination(
  expectedFlow: AuthCallbackFlow,
  redirectType: unknown,
): AuthCallbackDestination | null {
  if (expectedFlow === "recovery") {
    return redirectType === "recovery" ? "/reset-password" : null;
  }
  // Refuse a recovery exchange on any other flow: a recovery link must never be
  // spent on a destination that leaves the recovery marker unissued.
  if (redirectType !== null) return null;
  if (expectedFlow === "email-change") {
    return "/account/security?notice=email-change-confirmed";
  }
  if (expectedFlow === "signup") return "/account";
  return null;
}

export function buildAuthCallbackUrl(siteUrl: string, flow: AuthCallbackFlow): string {
  const callbackUrl = new URL("/auth/confirm", siteUrl);
  callbackUrl.searchParams.set("flow", flow);
  return callbackUrl.toString();
}
