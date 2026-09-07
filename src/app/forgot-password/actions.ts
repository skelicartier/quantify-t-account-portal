"use server";

import { parseRecoveryRequestFormData, type RecoveryRequestActionState } from "@/lib/auth/recovery";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const EMPTY_FIELD_ERRORS: RecoveryRequestActionState["fieldErrors"] = {
  email: [],
  challenge: [],
};

const ACCEPTED_RECOVERY_STATE: RecoveryRequestActionState = {
  status: "accepted",
  message: "If an account can use recovery, check that inbox for the next step.",
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
    // TODO: Implement Azure SQL password recovery with email
    // For now, return success to not reveal whether account exists
    return ACCEPTED_RECOVERY_STATE;
  } catch {
    return SERVICE_ERROR_STATE;
  }
}
