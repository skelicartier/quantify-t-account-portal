"use server";

import { clearRecoveryAuthorization } from "@/lib/auth/recovery-authorization";
import { parseResetPasswordFormData, type ResetPasswordActionState } from "@/lib/auth/recovery";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { AzureAuthClient } from "@/lib/azure-auth-client";
import { getAzureAuthConfig } from "@/lib/azure-auth-config";

const EMPTY_FIELD_ERRORS: ResetPasswordActionState["fieldErrors"] = {
  password: [],
  passwordConfirmation: [],
};

const INVALID_RECOVERY_STATE: ResetPasswordActionState = {
  status: "error",
  message: "This recovery link is invalid or has expired. Request a new recovery email.",
  fieldErrors: EMPTY_FIELD_ERRORS,
};

const SERVICE_ERROR_STATE: ResetPasswordActionState = {
  status: "error",
  message: "Secure password update is temporarily unavailable. Please try again.",
  fieldErrors: EMPTY_FIELD_ERRORS,
};

const SUCCESS_STATE: ResetPasswordActionState = {
  status: "success",
  message: "Password updated. You can now sign in with your new password.",
  fieldErrors: EMPTY_FIELD_ERRORS,
};

export async function resetPassword(
  _previousState: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  const parsed = parseResetPasswordFormData(formData);
  if (!parsed.success) return parsed.state;

  const rawToken = formData.get("token");
  const token = typeof rawToken === "string" ? rawToken.trim() : "";
  if (!token || token.length > 4_096) {
    return INVALID_RECOVERY_STATE;
  }

  try {
    await requireSameOriginServerAction();
    const config = getAzureAuthConfig();
    const client = new AzureAuthClient(config.apiUrl);
    await client.resetPassword(token, parsed.data.password);
    await clearRecoveryAuthorization();
    return SUCCESS_STATE;
  } catch {
    return SERVICE_ERROR_STATE;
  }
}
