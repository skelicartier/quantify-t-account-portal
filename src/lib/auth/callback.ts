export type AuthCallbackFlow = "signup" | "recovery";
export type AuthCallbackDestination = "/account" | "/reset-password";

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
  return value === "signup" || value === "recovery";
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

export function resolveTrustedAuthDestination(
  expectedFlow: AuthCallbackFlow,
  redirectType: unknown,
): AuthCallbackDestination | null {
  if (expectedFlow === "recovery" && redirectType === "recovery") {
    return "/reset-password";
  }
  if (expectedFlow === "signup" && redirectType === null) {
    return "/account";
  }
  return null;
}

export function buildAuthCallbackUrl(siteUrl: string, flow: AuthCallbackFlow): string {
  const callbackUrl = new URL("/auth/confirm", siteUrl);
  callbackUrl.searchParams.set("flow", flow);
  return callbackUrl.toString();
}
