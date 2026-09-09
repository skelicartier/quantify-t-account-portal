"use server";

import { parseRecoveryRequestFormData, type RecoveryRequestActionState } from "@/lib/auth/recovery";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { AzureAuthClient } from "@/lib/azure-auth-client";
import { getAzureAuthConfig } from "@/lib/azure-auth-config";

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

export async function requestPasswordRecovery(
  _previousState: RecoveryRequestActionState,
  formData: FormData,
): Promise<RecoveryRequestActionState> {
  const parsed = parseRecoveryRequestFormData(formData);
  if (!parsed.success) return parsed.state;

  try {
    await requireSameOriginServerAction();
    const config = getAzureAuthConfig();
    const client = new AzureAuthClient(config.apiUrl);
    await client.forgotPassword(parsed.data.email);
    return ACCEPTED_RECOVERY_STATE;
  } catch {
    return SERVICE_ERROR_STATE;
  }
}
