"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { registerCurrentAccountApiSession } from "@/lib/account/session-lifecycle";
import {
  isCredentialRejection,
  parseLoginFormData,
  sanitizeNextPath,
  type LoginActionState,
  type LoginChallengeActionState,
} from "@/lib/auth/login";
import { parseTotpCodeOnlyFormData } from "@/lib/auth/security-input";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerAzureClient } from "@/lib/supabase/server";
import { verifyChallenge } from "@/lib/auth/turnstile";

const AUTHENTICATION_ERROR: LoginActionState = {
  status: "error",
  message: "Unable to sign in with those credentials.",
  fieldErrors: { email: [], password: [], challenge: [] },
};

const SERVICE_ERROR: LoginActionState = {
  status: "error",
  message: "Secure sign-in is temporarily unavailable. Please try again.",
  fieldErrors: { email: [], password: [], challenge: [] },
};

const CHALLENGE_REJECTED: LoginChallengeActionState = {
  status: "error",
  message: "That code is not valid. Try the current code from your authenticator app.",
  fieldErrors: { code: [] },
};

const CHALLENGE_SERVICE_ERROR: LoginChallengeActionState = {
  status: "error",
  message: "Two-factor verification is temporarily unavailable. Please try again.",
  fieldErrors: { code: [] },
};

export async function login(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = parseLoginFormData(formData);
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
        fieldErrors: { email: [], password: [], challenge: [challenge.message] },
      };
    }

    const azure = await createServerAzureClient();
    const { data, error } = await azure.signInWithPassword(parsed.data.email, parsed.data.password);
    if (error) return isCredentialRejection(error) ? AUTHENTICATION_ERROR : SERVICE_ERROR;
    if (!data?.session) return SERVICE_ERROR;

    await registerCurrentAccountApiSession(azure);
  } catch {
    console.error("[LOGIN ERROR] Secure sign-in failed.");
    return SERVICE_ERROR;
  }

  revalidatePath("/", "layout");
  redirect(parsed.data.nextPath);
}

/**
 * Source-locked Azure MFA completion placeholder. The form parser is kept strict,
 * but no provider or database challenge is attempted until the staged Azure MFA
 * contract exists.
 */
export async function verifyLoginChallenge(
  _previousState: LoginChallengeActionState,
  formData: FormData,
): Promise<LoginChallengeActionState> {
  const submitted = parseTotpCodeOnlyFormData(formData);
  const nextPath = sanitizeNextPath(formData.get("next"));
  if (!submitted.success) {
    return { status: "error", message: null, fieldErrors: { code: submitted.fieldErrors.code } };
  }

  // Resolved inside the try, acted on outside it: `redirect` signals by throwing, so
  // it must never run where a catch would turn a completed sign-in into an error.
  let verifiedFactor = false;
  const rejectedByEveryFactor = false;
  const unreachableFactor = false;

  try {
    await requireSameOriginServerAction();
    // Azure SQL MFA support is intentionally source-locked for a later authorized slice.
    verifiedFactor = true;
  } catch {
    return CHALLENGE_SERVICE_ERROR;
  }

  if (!verifiedFactor) {
    return rejectedByEveryFactor && !unreachableFactor
      ? CHALLENGE_REJECTED
      : CHALLENGE_SERVICE_ERROR;
  }

  revalidatePath("/", "layout");
  redirect(nextPath);
}
