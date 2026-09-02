import { z } from "zod";

import {
  CHALLENGE_ERROR_MESSAGE,
  CHALLENGE_FIELD_NAME,
  MAX_CHALLENGE_TOKEN_LENGTH,
} from "@/lib/auth/challenge";
import { LEGAL_CONSENT_FIELD_NAME, isLegalConsentAccepted } from "@/lib/auth/consent";

const signupSchema = z
  .object({
    email: z
      .string({ error: "Enter your email address." })
      .trim()
      .toLowerCase()
      .max(254, "Email address is too long.")
      .email("Enter a valid email address."),
    password: z
      .string({ error: "Create a password." })
      .min(12, "Use at least 12 characters.")
      .max(128, "Password must be 128 characters or fewer."),
    passwordConfirmation: z.string({ error: "Confirm your password." }),
    legalConsent: z.custom<"on">(isLegalConsentAccepted, {
      message: "Accept the Terms of Service and Privacy Policy to continue.",
    }),
    challenge: z
      .string({ error: CHALLENGE_ERROR_MESSAGE })
      .trim()
      .min(1, CHALLENGE_ERROR_MESSAGE)
      .max(MAX_CHALLENGE_TOKEN_LENGTH, CHALLENGE_ERROR_MESSAGE),
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

export type SignupActionState = {
  status: "idle" | "error" | "accepted";
  message: string | null;
  fieldErrors: {
    email: string[];
    password: string[];
    passwordConfirmation: string[];
    legalConsent: string[];
    challenge: string[];
  };
};

export type SignupAction = (
  previousState: SignupActionState,
  formData: FormData,
) => Promise<SignupActionState>;

export const INITIAL_SIGNUP_STATE: SignupActionState = {
  status: "idle",
  message: null,
  fieldErrors: {
    email: [],
    password: [],
    passwordConfirmation: [],
    legalConsent: [],
    challenge: [],
  },
};

export type ParsedSignupForm =
  | {
      success: true;
      data: { email: string; password: string; captchaToken: string };
    }
  | { success: false; state: SignupActionState };

export function parseSignupFormData(formData: FormData): ParsedSignupForm {
  const result = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
    legalConsent: formData.get(LEGAL_CONSENT_FIELD_NAME),
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
          password: errors.password ?? [],
          passwordConfirmation: errors.passwordConfirmation ?? [],
          legalConsent: errors.legalConsent ?? [],
          challenge: errors.challenge ?? [],
        },
      },
    };
  }

  return {
    success: true,
    data: {
      email: result.data.email,
      password: result.data.password,
      captchaToken: result.data.challenge,
    },
  };
}
