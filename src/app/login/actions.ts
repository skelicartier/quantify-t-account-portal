"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { resolveAssuranceState } from "@/lib/auth/assurance";
import {
  isCredentialRejection,
  parseLoginFormData,
  sanitizeNextPath,
  type LoginActionState,
  type LoginChallengeActionState,
} from "@/lib/auth/login";
import { parseTotpCodeOnlyFormData, TOTP_CODE_LENGTH } from "@/lib/auth/security-input";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

const MFA_REQUIRED: LoginActionState = {
  status: "mfa-required",
  message: `Enter the ${TOTP_CODE_LENGTH}-digit code from your authenticator app to finish signing in.`,
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
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { captchaToken: parsed.data.captchaToken },
    });
    if (error) return isCredentialRejection(error) ? AUTHENTICATION_ERROR : SERVICE_ERROR;

    // A password alone is not a completed sign-in when a verified factor exists.
    // Stop here and require the challenge instead of redirecting into the account.
    //
    // The AAL1 session cookie written by the password step deliberately stays: the
    // provider's own challenge and verify calls act on that session, so clearing it
    // would make the second factor unsatisfiable. What stops it from being useful is
    // that an unsatisfied session gets nothing — every protected route redirects to
    // this challenge, and every account mutation refuses it through
    // `requireMutationAssurance`. The cookie is a ticket to finish signing in, not a
    // signed-in session.
    const assurance = await resolveAssuranceState(supabase);
    if (assurance.challengeRequired) return MFA_REQUIRED;
  } catch {
    return SERVICE_ERROR;
  }

  revalidatePath("/", "layout");
  redirect(parsed.data.nextPath);
}

/**
 * Complete a second-factor challenge for a session that already passed the password
 * step. Factors come from the provider's verified list, never from the submitted
 * form, so a caller cannot nominate an unverified or foreign factor — the form
 * carries a code and nothing else.
 *
 * A code belongs to one factor, and the portal caps enrollment at one, but an account
 * can still hold several verified factors from outside this portal. So each verified
 * factor is tried in turn and the code is only rejected once every factor has
 * rejected it; otherwise a visitor whose authenticator happened not to be first in
 * the list could never sign in. The cost is one provider challenge per extra factor
 * on a wrong code, which is why enrollment here stops at one.
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
  let rejectedByEveryFactor = false;
  let unreachableFactor = false;

  try {
    const supabase = await createServerSupabaseClient();
    const assurance = await resolveAssuranceState(supabase);

    for (const factor of assurance.verifiedTotpFactors) {
      const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (challenge.error || !challenge.data?.id) {
        // This factor was never asked, so the code cannot be called wrong on its
        // account; remember that and report unavailable rather than "wrong code".
        unreachableFactor = true;
        continue;
      }

      const verified = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.data.id,
        code: submitted.data.code,
      });
      if (!verified.error) {
        verifiedFactor = true;
        break;
      }
      rejectedByEveryFactor = true;
    }
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
