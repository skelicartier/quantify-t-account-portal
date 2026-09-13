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
import { verifyChallenge } from "@/lib/auth/turnstile";

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
 * The API says the address already has an account (`account_exists`). Say so — the
 * form offers sign-in and reset — and, for an account that was never verified, whether
 * a fresh confirmation link just went out.
 */
function existingAccountState(error: unknown): SignupActionState | null {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  if (record?.code !== "account_exists") return null;
  const details =
    record.details && typeof record.details === "object"
      ? (record.details as Record<string, unknown>)
      : {};
  const confirmed = details.confirmed !== false;
  const confirmationResent = details.confirmation_resent === true;
  let message = "An account with this email address already exists.";
  if (!confirmed) {
    message = confirmationResent
      ? "This email is already registered but not yet verified. We've sent you a new confirmation link — check your inbox."
      : "This email is already registered but not yet verified. Sign in to request a new confirmation link.";
  }
  return {
    status: "exists",
    message,
    fieldErrors: EMPTY_FIELD_ERRORS,
    account: { confirmed, confirmationResent },
  };
}

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
    // The challenge, checked with Cloudflare rather than merely collected. A no-op unless
    // both halves are configured, so a deployment that has not set them up is unaffected.
    const challenge = await verifyChallenge(parsed.data.captchaToken);
    if (!challenge.ok) {
      return {
        status: "error",
        message: challenge.message,
        fieldErrors: { ...EMPTY_FIELD_ERRORS, challenge: [challenge.message] },
      };
    }

    const azure = await createServerAzureClient();
    const result = await azure.signUp(
      parsed.data.email,
      parsed.data.password,
      parsed.data.firstName,
      parsed.data.lastName,
    );

    if (result.error) return existingAccountState(result.error) ?? SERVICE_ERROR_STATE;
    if (returnTo) await rememberDesktopConnectReturn(returnTo);
    return ACCEPTED_SIGNUP_STATE;
  } catch (e) {
    console.error("[SIGNUP ERROR]", e);
    return SERVICE_ERROR_STATE;
  }
}
