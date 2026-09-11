"use server";

import { cookies } from "next/headers";

import {
  DESKTOP_CONNECT_RETURN_COOKIE,
  DESKTOP_CONNECT_RETURN_MAX_AGE_SECONDS,
  desktopConnectNextPath,
} from "@/lib/auth/desktop-connect";
import { parseSignupFormData, type SignupActionState } from "@/lib/auth/signup";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerAzureClient } from "@/lib/supabase/server";

const EMPTY_FIELD_ERRORS: SignupActionState["fieldErrors"] = {
  fullName: [],
  email: [],
  password: [],
  passwordConfirmation: [],
  legalConsent: [],
  challenge: [],
};

const ACCEPTED_SIGNUP_STATE: SignupActionState = {
  status: "accepted",
  message: "Account created! Check your email to confirm your address.",
  fieldErrors: EMPTY_FIELD_ERRORS,
};

const SERVICE_ERROR_STATE: SignupActionState = {
  status: "error",
  message: "Secure registration is temporarily unavailable. Please try again.",
  fieldErrors: EMPTY_FIELD_ERRORS,
};

/**
 * Lets /auth/confirm send the visitor back to the waiting desktop app once the email is
 * confirmed. The confirmation link itself is built by the Account API, so the handoff
 * travels in a short-lived cookie in the browser the app opened.
 */
async function rememberDesktopConnectReturn(nextPath: string): Promise<void> {
  try {
    const store = await cookies();
    store.set(DESKTOP_CONNECT_RETURN_COOKIE, nextPath, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: DESKTOP_CONNECT_RETURN_MAX_AGE_SECONDS,
    });
  } catch {
    // The account exists either way; the visitor can restart the handoff from the app.
  }
}

export async function signup(
  _previousState: SignupActionState,
  formData: FormData,
): Promise<SignupActionState> {
  const parsed = parseSignupFormData(formData);
  if (!parsed.success) return parsed.state;
  const returnTo = desktopConnectNextPath(formData.get("next"));

  try {
    await requireSameOriginServerAction();
    const azure = await createServerAzureClient();
    const result = await azure.signUp(
      parsed.data.email,
      parsed.data.password,
      parsed.data.firstName,
      parsed.data.lastName,
    );

    if (result.error) return SERVICE_ERROR_STATE;
    if (returnTo) await rememberDesktopConnectReturn(returnTo);
    return ACCEPTED_SIGNUP_STATE;
  } catch (e) {
    console.error("[SIGNUP ERROR]", e);
    return SERVICE_ERROR_STATE;
  }
}
