"use server";

import { parseRecoveryRequestFormData, type RecoveryRequestActionState } from "@/lib/auth/recovery";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { AzureAuthClient } from "@/lib/azure-auth-client";
import { getAzureAuthConfig } from "@/lib/azure-auth-config";
import { verifyChallenge } from "@/lib/auth/turnstile";

const EMPTY_FIELD_ERRORS: RecoveryRequestActionState["fieldErrors"] = {
  email: [],
  challenge: [],
};

const ACCEPTED_RECOVERY_STATE: RecoveryRequestActionState = {
  status: "accepted",
  message: "If an account exists with that email, check your inbox for a recovery link.",
  fieldErrors: EMPTY_FIELD_ERRORS,
};

const SERVICE_ERROR_STATE: RecoveryRequestActionState = {
  status: "error",
  message: "Secure account recovery is temporarily unavailable. Please try again.",
  fieldErrors: EMPTY_FIELD_ERRORS,
};

/**
 * THERE IS DELIBERATELY NO RATE-LIMIT BRANCH HERE, unlike sign-in and registration.
 *
 * Recovery IS limited — three requests an hour per address, fifteen per source, which is what
 * stops this form being used to bury somebody's inbox — but the service enforces it SILENTLY:
 * it answers exactly as it does when the address has no account, and simply does not send.
 *
 * That is the whole point. This route answers identically whether or not an account exists so
 * it cannot be used to test which addresses are registered. A console that said "too many
 * attempts" when the limit bit would hand that back: an attacker learns an address is real
 * precisely because asking about it repeatedly started being refused. So the answer below never
 * changes, and adding a 429 branch here would be a regression rather than an improvement.
 */

export async function requestPasswordRecovery(
  _previousState: RecoveryRequestActionState,
  formData: FormData,
): Promise<RecoveryRequestActionState> {
  const parsed = parseRecoveryRequestFormData(formData);
  if (!parsed.success) return parsed.state;

  try {
    await requireSameOriginServerAction();
    // The challenge, checked with Cloudflare rather than merely collected. A no-op unless
    // both halves are configured, so a deployment that has not set them up is unaffected.
    const challenge = await verifyChallenge(parsed.data.captchaToken);
    if (!challenge.ok) {
      return {
        status: "error",
        message: challenge.message,
        fieldErrors: { email: [], challenge: [challenge.message] },
      };
    }

    const config = getAzureAuthConfig();
    const client = new AzureAuthClient(config.apiUrl);
    await client.forgotPassword(parsed.data.email);
    return ACCEPTED_RECOVERY_STATE;
  } catch {
    return SERVICE_ERROR_STATE;
  }
}
