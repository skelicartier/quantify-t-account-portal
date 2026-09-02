import { z } from "zod";

import {
  CHALLENGE_ERROR_MESSAGE,
  CHALLENGE_FIELD_NAME,
  MAX_CHALLENGE_TOKEN_LENGTH,
} from "@/lib/auth/challenge";

const recoveryRequestSchema = z.object({
  email: z
    .string({ error: "Enter your email address." })
    .trim()
    .toLowerCase()
    .max(254, "Email address is too long.")
    .email("Enter a valid email address."),
  challenge: z
    .string({ error: CHALLENGE_ERROR_MESSAGE })
    .trim()
    .min(1, CHALLENGE_ERROR_MESSAGE)
    .max(MAX_CHALLENGE_TOKEN_LENGTH, CHALLENGE_ERROR_MESSAGE),
});

const resetPasswordSchema = z
  .object({
    password: z
      .string({ error: "Enter a new password." })
      .min(12, "Use at least 12 characters.")
      .max(128, "Password must be 128 characters or fewer."),
    passwordConfirmation: z.string({ error: "Confirm your new password." }),
  })
  .superRefine(({ password, passwordConfirmation }, context) => {
    if (password !== passwordConfirmation) {
      context.addIssue({
        code: "custom",
        path: ["passwordConfirmation"],
        message: "Passwords do not match.",
      });
    }
  });

export type RecoveryRequestActionState = {
  status: "idle" | "error" | "accepted";
  message: string | null;
  fieldErrors: { email: string[]; challenge: string[] };
};

export type RecoveryRequestAction = (
  previousState: RecoveryRequestActionState,
  formData: FormData,
) => Promise<RecoveryRequestActionState>;

export const INITIAL_RECOVERY_REQUEST_STATE: RecoveryRequestActionState = {
  status: "idle",
  message: null,
  fieldErrors: { email: [], challenge: [] },
};

export type ResetPasswordActionState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: { password: string[]; passwordConfirmation: string[] };
};

export type ResetPasswordAction = (
  previousState: ResetPasswordActionState,
  formData: FormData,
) => Promise<ResetPasswordActionState>;

export const INITIAL_RESET_PASSWORD_STATE: ResetPasswordActionState = {
  status: "idle",
  message: null,
  fieldErrors: { password: [], passwordConfirmation: [] },
};

export type ParsedRecoveryRequest =
  | { success: true; data: { email: string; captchaToken: string } }
  | { success: false; state: RecoveryRequestActionState };

export function parseRecoveryRequestFormData(formData: FormData): ParsedRecoveryRequest {
  const result = recoveryRequestSchema.safeParse({
    email: formData.get("email"),
    challenge: formData.get(CHALLENGE_FIELD_NAME),
  });

  if (!result.success) {
    const errors = z.flattenError(result.error).fieldErrors;
    return {
      success: false,
      state: {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fieldErrors: {
          email: errors.email ?? [],
          challenge: errors.challenge ?? [],
        },
      },
    };
  }

  return {
    success: true,
    data: { email: result.data.email, captchaToken: result.data.challenge },
  };
}

export type ParsedResetPassword =
  | { success: true; data: { password: string } }
  | { success: false; state: ResetPasswordActionState };

export function parseResetPasswordFormData(formData: FormData): ParsedResetPassword {
  const result = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });

  if (!result.success) {
    const errors = z.flattenError(result.error).fieldErrors;
    return {
      success: false,
      state: {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fieldErrors: {
          password: errors.password ?? [],
          passwordConfirmation: errors.passwordConfirmation ?? [],
        },
      },
    };
  }

  return { success: true, data: { password: result.data.password } };
}
