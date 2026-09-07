"use server";

import {
  clearRecoveryAuthorization,
} from "@/lib/auth/recovery-authorization";
import { parseResetPasswordFormData, type ResetPasswordActionState } from "@/lib/auth/recovery";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerAzureClient } from "@/lib/supabase/server";

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

export async function resetPassword(
  _previousState: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  const parsed = parseResetPasswordFormData(formData);
  if (!parsed.success) return parsed.state;

  try {
    await requireSameOriginServerAction();
    const azure = await createServerAzureClient();
    const accessToken = azure.getAccessToken();
    
    if (!accessToken) {
      await clearRecoveryAuthorization();
      return INVALID_RECOVERY_STATE;
    }

    // TODO: Implement Azure SQL password reset with recovery authorization
    // For now, return service error
    return SERVICE_ERROR_STATE;
  } catch {
    return SERVICE_ERROR_STATE;
  }
}
