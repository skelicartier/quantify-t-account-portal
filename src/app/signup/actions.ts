"use server";

import { buildAuthCallbackUrl } from "@/lib/auth/callback";
import { createSignupConsentMetadata } from "@/lib/auth/consent";
import { parseSignupFormData, type SignupActionState } from "@/lib/auth/signup";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { getSupabasePublicConfiguration } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

const DUPLICATE_SIGNUP_CODES = new Set([
  "email_exists",
  "identity_already_exists",
  "user_already_exists",
]);

function isDuplicateSignup(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && DUPLICATE_SIGNUP_CODES.has(code);
}

export async function signup(
  _previousState: SignupActionState,
  formData: FormData,
): Promise<SignupActionState> {
  const parsed = parseSignupFormData(formData);
  if (!parsed.success) return parsed.state;

  try {
    await requireSameOriginServerAction();
    const { siteUrl } = getSupabasePublicConfiguration();
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: buildAuthCallbackUrl(siteUrl, "signup"),
        captchaToken: parsed.data.captchaToken,
        data: createSignupConsentMetadata(),
      },
    });

    if (error && !isDuplicateSignup(error)) return SERVICE_ERROR_STATE;
    return ACCEPTED_SIGNUP_STATE;
  } catch {
    return SERVICE_ERROR_STATE;
  }
}
