"use server";

import { buildAuthCallbackUrl } from "@/lib/auth/callback";
import { parseRecoveryRequestFormData, type RecoveryRequestActionState } from "@/lib/auth/recovery";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { getSupabasePublicConfiguration } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

const UNKNOWN_ACCOUNT_CODES = new Set(["identity_not_found", "user_not_found"]);

function isUnknownAccount(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && UNKNOWN_ACCOUNT_CODES.has(code);
}

export async function requestPasswordRecovery(
  _previousState: RecoveryRequestActionState,
  formData: FormData,
): Promise<RecoveryRequestActionState> {
  const parsed = parseRecoveryRequestFormData(formData);
  if (!parsed.success) return parsed.state;

  try {
    await requireSameOriginServerAction();
    const { siteUrl } = getSupabasePublicConfiguration();
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: buildAuthCallbackUrl(siteUrl, "recovery"),
      captchaToken: parsed.data.captchaToken,
    });

    if (error && !isUnknownAccount(error)) return SERVICE_ERROR_STATE;
    return ACCEPTED_RECOVERY_STATE;
  } catch {
    return SERVICE_ERROR_STATE;
  }
}
