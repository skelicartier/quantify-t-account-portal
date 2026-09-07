"use server";

import { revalidatePath } from "next/cache";

import { buildAuthCallbackUrl } from "@/lib/auth/callback";
import {
  INITIAL_TOTP_ENROLLMENT_STATE,
  parseCurrentPasswordFormData,
  parseEmailChangeFormData,
  parseFactorRemovalFormData,
  parsePasswordChangeFormData,
  parseTotpCodeFormData,
  type EmailChangeActionState,
  type PasswordChangeActionState,
  type TotpEnrollmentState,
} from "@/lib/auth/security-input";
import { requireMutationAssurance } from "@/lib/dal/assurance-guard";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { getSupabasePublicConfiguration } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { verifyCurrentPassword } from "@/lib/supabase/verification-client";

const CHALLENGE_REQUIRED_MESSAGE =
  "Finish signing in with your authenticator code before changing your security settings.";

const PASSWORD_SERVICE_ERROR: PasswordChangeActionState = {
  status: "error",
  message: "Password changes are temporarily unavailable. Please try again.",
  fieldErrors: { currentPassword: [], password: [], passwordConfirmation: [] },
};

const PASSWORD_CHALLENGE_ERROR: PasswordChangeActionState = {
  ...PASSWORD_SERVICE_ERROR,
  message: CHALLENGE_REQUIRED_MESSAGE,
};

const PASSWORD_REAUTHENTICATION_ERROR: PasswordChangeActionState = {
  status: "error",
  message: "Check the highlighted fields and try again.",
  fieldErrors: {
    currentPassword: ["That password is not correct."],
    password: [],
    passwordConfirmation: [],
  },
};

const EMAIL_SERVICE_ERROR: EmailChangeActionState = {
  status: "error",
  message: "Email changes are temporarily unavailable. Please try again.",
  fieldErrors: { currentPassword: [], email: [] },
};

const EMAIL_CHALLENGE_ERROR: EmailChangeActionState = {
  ...EMAIL_SERVICE_ERROR,
  message: CHALLENGE_REQUIRED_MESSAGE,
};

const EMAIL_REAUTHENTICATION_ERROR: EmailChangeActionState = {
  status: "error",
  message: "Check the highlighted fields and try again.",
  fieldErrors: { currentPassword: ["That password is not correct."], email: [] },
};

const TOTP_SERVICE_ERROR: TotpEnrollmentState = {
  ...INITIAL_TOTP_ENROLLMENT_STATE,
  status: "error",
  message: "Two-factor setup is temporarily unavailable. Please try again.",
};

const TOTP_CHALLENGE_ERROR: TotpEnrollmentState = {
  ...INITIAL_TOTP_ENROLLMENT_STATE,
  status: "error",
  message: CHALLENGE_REQUIRED_MESSAGE,
};

const WRONG_PASSWORD_TOTP_ERROR: TotpEnrollmentState = {
  ...INITIAL_TOTP_ENROLLMENT_STATE,
  status: "error",
  message: "Check the highlighted fields and try again.",
  fieldErrors: { code: [], currentPassword: ["That password is not correct."] },
};

/**
 * A removal rejection names the factor it belongs to. With several removal controls on
 * one page they share a single action state, so an unscoped field error would mark an
 * input the owner never submitted as invalid.
 */
function wrongPasswordForFactor(factorId: string): TotpEnrollmentState {
  return { ...WRONG_PASSWORD_TOTP_ERROR, factorId };
}

function refreshSecurityRoutes(): void {
  revalidatePath("/account");
  revalidatePath("/account/security");
}

/**
 * Read the caller's verified identity. Returns null when Auth reports no verified
 * user so the action fails without guessing who is calling.
 */
async function verifiedCaller(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<{ id: string; email: string } | null> {
  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email?.trim().toLowerCase();
  if (error || !data.user?.id || !email) return null;
  return { id: data.user.id, email };
}

export async function changePassword(
  _previousState: PasswordChangeActionState,
  formData: FormData,
): Promise<PasswordChangeActionState> {
  const parsed = parsePasswordChangeFormData(formData);
  if (!parsed.success) return parsed.state;

  // Cleared other sessions? Only claim it in the success copy if it actually happened.
  let otherSessionsCleared = false;

  try {
    await requireSameOriginServerAction();
    // Assurance first, before any password is checked: an AAL1 caller must not be
    // able to use this action as a password oracle, or spend the provider's
    // verification rate limit, on a request that will be refused anyway.
    const { decision } = await requireMutationAssurance();
    if (decision === "challenge-required") return PASSWORD_CHALLENGE_ERROR;
    if (decision !== "satisfied") return PASSWORD_SERVICE_ERROR;

    const supabase = await createServerSupabaseClient();
    const caller = await verifiedCaller(supabase);
    if (!caller) return PASSWORD_SERVICE_ERROR;

    // Reauthenticate on an isolated client so this cannot rotate or downgrade the
    // caller's own session, then only proceed on a positive verification.
    const verification = await verifyCurrentPassword(caller.email, parsed.data.currentPassword);
    if (verification === "rejected") return PASSWORD_REAUTHENTICATION_ERROR;
    if (verification !== "verified") return PASSWORD_SERVICE_ERROR;

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) return PASSWORD_SERVICE_ERROR;

    // Best effort: a password change should not leave other sessions signed in. The
    // password is already rotated either way, so a failure here is reported, not
    // retried and not hidden behind copy that claims more than happened.
    try {
      const signedOut = await supabase.auth.signOut({ scope: "others" });
      otherSessionsCleared = !signedOut?.error;
    } catch {
      otherSessionsCleared = false;
    }
  } catch {
    return PASSWORD_SERVICE_ERROR;
  }

  refreshSecurityRoutes();
  return {
    status: "success",
    message: otherSessionsCleared
      ? "Password updated. Other signed-in sessions were signed out."
      : "Password updated. Other sessions could not be signed out — sign out everywhere from each device you still trust.",
    fieldErrors: { currentPassword: [], password: [], passwordConfirmation: [] },
  };
}

export async function changeEmail(
  _previousState: EmailChangeActionState,
  formData: FormData,
): Promise<EmailChangeActionState> {
  const parsed = parseEmailChangeFormData(formData);
  if (!parsed.success) return parsed.state;

  try {
    await requireSameOriginServerAction();
    const { decision } = await requireMutationAssurance();
    if (decision === "challenge-required") return EMAIL_CHALLENGE_ERROR;
    if (decision !== "satisfied") return EMAIL_SERVICE_ERROR;

    const { siteUrl } = getSupabasePublicConfiguration();
    const supabase = await createServerSupabaseClient();
    const caller = await verifiedCaller(supabase);
    if (!caller) return EMAIL_SERVICE_ERROR;

    if (caller.email === parsed.data.email) {
      return {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fieldErrors: {
          currentPassword: [],
          email: ["That is already your verified email address."],
        },
      };
    }

    const verification = await verifyCurrentPassword(caller.email, parsed.data.currentPassword);
    if (verification === "rejected") return EMAIL_REAUTHENTICATION_ERROR;
    if (verification !== "verified") return EMAIL_SERVICE_ERROR;

    const { error } = await supabase.auth.updateUser(
      { email: parsed.data.email },
      { emailRedirectTo: buildAuthCallbackUrl(siteUrl, "email-change") },
    );
    // A generic outcome either way: never reveal whether the address is already taken.
    if (error) return EMAIL_SERVICE_ERROR;
  } catch {
    return EMAIL_SERVICE_ERROR;
  }

  refreshSecurityRoutes();
  return {
    status: "success",
    message:
      "Confirm the change from both your current and new inboxes. The address only changes after both links are used.",
    fieldErrors: { currentPassword: [], email: [] },
  };
}

/**
 * Begin TOTP enrollment.
 *
 * This requires the current password for the same reason removal does, and arguably a
 * stronger one: verifying a factor raises the required level for *every* session of
 * the account, so an unauthenticated-by-second-factor caller who could enroll their
 * own authenticator would push the owner into the identity-verified support path that
 * this page's recovery guidance describes. Enrollment is an account-weakening
 * operation from the owner's point of view, not a strengthening one.
 *
 * Abandoned unverified factors are removed first so repeated setup attempts cannot
 * accumulate provider-side factors.
 */
export async function startTotpEnrollment(
  _previousState: TotpEnrollmentState,
  formData: FormData,
): Promise<TotpEnrollmentState> {
  const submitted = parseCurrentPasswordFormData(formData);
  if (!submitted.success) {
    return {
      ...INITIAL_TOTP_ENROLLMENT_STATE,
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: { code: [], currentPassword: submitted.fieldErrors.currentPassword },
    };
  }

  try {
    await requireSameOriginServerAction();
    const { decision, assurance } = await requireMutationAssurance();
    if (decision === "challenge-required") return TOTP_CHALLENGE_ERROR;
    if (decision !== "satisfied") return TOTP_SERVICE_ERROR;

    const supabase = await createServerSupabaseClient();
    const caller = await verifiedCaller(supabase);
    if (!caller) return TOTP_SERVICE_ERROR;

    // One verified authenticator per account through this portal. Everything else on
    // this page addresses a single factor unambiguously — the sign-in challenge and
    // the removal control — and a second enrollment would make "the" factor a guess.
    if (assurance.verifiedTotpFactors.length > 0) {
      return {
        ...INITIAL_TOTP_ENROLLMENT_STATE,
        status: "error",
        message:
          "An authenticator is already set up for this account. Remove it before adding a new one.",
      };
    }

    const verification = await verifyCurrentPassword(caller.email, submitted.data.currentPassword);
    if (verification === "rejected") return WRONG_PASSWORD_TOTP_ERROR;
    if (verification !== "verified") return TOTP_SERVICE_ERROR;

    for (const staleFactorId of assurance.unverifiedTotpFactorIds) {
      try {
        await supabase.auth.mfa.unenroll({ factorId: staleFactorId });
      } catch {
        // A surviving unverified factor is harmless; it grants no assurance.
      }
    }

    const enrolled = await supabase.auth.mfa.enroll({
      factorType: "totp",
      // Unique per attempt: the provider rejects a duplicate friendly name, so a name
      // derived from the date alone would let one surviving unverified factor block
      // every further attempt until tomorrow, reported only as "unavailable".
      friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)} ${crypto
        .randomUUID()
        .slice(0, 8)}`,
    });
    const factorId = enrolled.data?.id;
    const totp = enrolled.data?.totp;
    if (enrolled.error || !factorId || !totp?.qr_code || !totp?.secret) return TOTP_SERVICE_ERROR;

    return {
      status: "pending-verification",
      message: "Scan the code in your authenticator app, then enter the code it shows.",
      factorId,
      qrCode: totp.qr_code,
      secret: totp.secret,
      fieldErrors: { code: [], currentPassword: [] },
    };
  } catch {
    return TOTP_SERVICE_ERROR;
  }
}

/**
 * Verify the first code from the authenticator, which is what turns an enrollment
 * into a verified factor and upgrades this session to AAL2.
 */
export async function confirmTotpEnrollment(
  previousState: TotpEnrollmentState,
  formData: FormData,
): Promise<TotpEnrollmentState> {
  let confirmedFactorId: string | null = null;
  const submitted = parseTotpCodeFormData(formData);
  if (!submitted.success) {
    return {
      ...previousState,
      status: "pending-verification",
      message: null,
      fieldErrors: { code: submitted.fieldErrors.code, currentPassword: [] },
    };
  }

  try {
    await requireSameOriginServerAction();
    const { decision, assurance } = await requireMutationAssurance();
    if (decision === "challenge-required") return TOTP_CHALLENGE_ERROR;
    if (decision !== "satisfied") return TOTP_SERVICE_ERROR;

    // The form is never the source of a factor id: only a factor the provider itself
    // reports as this caller's pending enrollment may be challenged.
    if (!assurance.unverifiedTotpFactorIds.includes(submitted.data.factorId)) {
      return TOTP_SERVICE_ERROR;
    }

    const supabase = await createServerSupabaseClient();
    const caller = await verifiedCaller(supabase);
    if (!caller) return TOTP_SERVICE_ERROR;

    const challenge = await supabase.auth.mfa.challenge({ factorId: submitted.data.factorId });
    if (challenge.error || !challenge.data?.id) return TOTP_SERVICE_ERROR;

    const verified = await supabase.auth.mfa.verify({
      factorId: submitted.data.factorId,
      challengeId: challenge.data.id,
      code: submitted.data.code,
    });
    if (verified.error) {
      return {
        ...previousState,
        status: "pending-verification",
        message: null,
        fieldErrors: {
          code: ["That code is not valid. Try the current code from your authenticator app."],
          currentPassword: [],
        },
      };
    }
    confirmedFactorId = submitted.data.factorId;
  } catch {
    return TOTP_SERVICE_ERROR;
  }

  refreshSecurityRoutes();
  return {
    ...INITIAL_TOTP_ENROLLMENT_STATE,
    status: "success",
    // The confirmed factor id is kept (the secret and QR are not): it is how the panel
    // tells "this enrollment is already done" from "a new enrollment has started".
    factorId: confirmedFactorId,
    message: "Two-factor authentication is on. You will be asked for a code at every sign-in.",
  };
}

/**
 * Remove a verified factor. This weakens the account, so it requires the current
 * password and refuses any factor the provider does not report as verified.
 */
export async function removeTotpFactor(
  _previousState: TotpEnrollmentState,
  formData: FormData,
): Promise<TotpEnrollmentState> {
  const submitted = parseFactorRemovalFormData(formData);
  if (!submitted.success) {
    return {
      ...INITIAL_TOTP_ENROLLMENT_STATE,
      status: "error",
      message: "Check the highlighted fields and try again.",
      fieldErrors: {
        code: [],
        currentPassword: submitted.fieldErrors.currentPassword,
      },
    };
  }

  let remainingVerifiedFactors = 0;

  try {
    await requireSameOriginServerAction();
    const { decision, assurance } = await requireMutationAssurance();
    if (decision === "challenge-required") return TOTP_CHALLENGE_ERROR;
    if (decision !== "satisfied") return TOTP_SERVICE_ERROR;

    const owned = assurance.verifiedTotpFactors.some(
      (factor) => factor.id === submitted.data.factorId,
    );
    if (!owned) return TOTP_SERVICE_ERROR;

    const supabase = await createServerSupabaseClient();
    const caller = await verifiedCaller(supabase);
    if (!caller) return TOTP_SERVICE_ERROR;

    const verification = await verifyCurrentPassword(caller.email, submitted.data.currentPassword);
    if (verification === "rejected") return wrongPasswordForFactor(submitted.data.factorId);
    if (verification !== "verified") return TOTP_SERVICE_ERROR;

    const { error } = await supabase.auth.mfa.unenroll({ factorId: submitted.data.factorId });
    if (error) return TOTP_SERVICE_ERROR;

    // Factors enrolled outside this portal mean removal is not always the last one.
    // Only claim password-only sign-in when the attested list says so.
    remainingVerifiedFactors = assurance.verifiedTotpFactors.filter(
      (factor) => factor.id !== submitted.data.factorId,
    ).length;
  } catch {
    return TOTP_SERVICE_ERROR;
  }

  refreshSecurityRoutes();
  return {
    ...INITIAL_TOTP_ENROLLMENT_STATE,
    status: "success",
    message:
      remainingVerifiedFactors === 0
        ? "Authenticator removed. Sign-in now requires only your password."
        : "Authenticator removed. Your other authenticator is still required at sign-in.",
  };
}
