"use server";

import { parseSignupFormData, type SignupActionState } from "@/lib/auth/signup";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerAzureClient } from "@/lib/supabase/server";

const EMPTY_FIELD_ERRORS: SignupActionState["fieldErrors"] = {
  email: [],
  password: [],
  passwordConfirmation: [],
  legalConsent: [],
  challenge: [],
};

const ACCEPTED_SIGNUP_STATE: SignupActionState = {
  status: "accepted",
  message: "If this address can be registered, check your email for the next step.",
  fieldErrors: EMPTY_FIELD_ERRORS,
};

const SERVICE_ERROR_STATE: SignupActionState = {
  status: "error",
  message: "Secure registration is temporarily unavailable. Please try again.",
  fieldErrors: EMPTY_FIELD_ERRORS,
};

export async function signup(
  _previousState: SignupActionState,
  formData: FormData,
): Promise<SignupActionState> {
  const parsed = parseSignupFormData(formData);
  if (!parsed.success) return parsed.state;

  try {
    await requireSameOriginServerAction();
    const azure = await createServerAzureClient();
    const result = await azure.signUp(parsed.data.email, parsed.data.password);

    if (result.error) return SERVICE_ERROR_STATE;
    return ACCEPTED_SIGNUP_STATE;
  } catch (e) {
    console.error("[SIGNUP ERROR]", e);
    return SERVICE_ERROR_STATE;
  }
}
