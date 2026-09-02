import { z } from "zod";

import {
  existingPasswordSchema,
  newPasswordSchema,
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_REUSE_MESSAGE,
} from "@/lib/auth/password-policy";

export const TOTP_CODE_LENGTH = 6;
export const MAX_FACTOR_ID_LENGTH = 64;

const TOTP_CODE_MESSAGE = `Enter the ${TOTP_CODE_LENGTH}-digit code from your authenticator app.`;

/** Reject duplicated fields outright: a second value means a tampered submission. */
function singleValue(formData: FormData, name: string): string | null {
  const values = formData.getAll(name);
  if (values.length !== 1) return null;
  const [value] = values;
  return typeof value === "string" ? value : null;
}

const passwordChangeSchema = z
  .object({
    currentPassword: existingPasswordSchema(),
    password: newPasswordSchema(),
    passwordConfirmation: z.string({ error: "Confirm your new password." }),
  })
  .superRefine(({ currentPassword, password, passwordConfirmation }, context) => {
    if (password !== passwordConfirmation) {
      context.addIssue({
        code: "custom",
        path: ["passwordConfirmation"],
        message: PASSWORD_MISMATCH_MESSAGE,
      });
    }
    if (password === currentPassword) {
      context.addIssue({ code: "custom", path: ["password"], message: PASSWORD_REUSE_MESSAGE });
    }
  });

const emailChangeSchema = z.object({
  currentPassword: existingPasswordSchema(),
  email: z
    .string({ error: "Enter your new email address." })
    .trim()
    .toLowerCase()
    .max(254, "Email address is too long.")
    .email("Enter a valid email address."),
});

const codeOnlySchema = z.object({
  code: z
    .string({ error: TOTP_CODE_MESSAGE })
    .trim()
    .regex(new RegExp(`^\\d{${TOTP_CODE_LENGTH}}$`, "u"), TOTP_CODE_MESSAGE),
});

const totpCodeSchema = codeOnlySchema.extend({
  factorId: z
    .string({ error: "Restart enrollment and try again." })
    .trim()
    .min(1, "Restart enrollment and try again.")
    .max(MAX_FACTOR_ID_LENGTH, "Restart enrollment and try again."),
});

const currentPasswordSchema = z.object({ currentPassword: existingPasswordSchema() });

const factorRemovalSchema = z.object({
  currentPassword: existingPasswordSchema(),
  factorId: z
    .string({ error: "Select the authenticator to remove." })
    .trim()
    .min(1, "Select the authenticator to remove.")
    .max(MAX_FACTOR_ID_LENGTH, "Select the authenticator to remove."),
});

export type SecurityStatus = "idle" | "success" | "error" | "pending-verification";

export type PasswordChangeFieldErrors = {
  currentPassword: string[];
  password: string[];
  passwordConfirmation: string[];
};

export type PasswordChangeActionState = {
  status: Exclude<SecurityStatus, "pending-verification">;
  message: string | null;
  fieldErrors: PasswordChangeFieldErrors;
};

export const INITIAL_PASSWORD_CHANGE_STATE: PasswordChangeActionState = {
  status: "idle",
  message: null,
  fieldErrors: { currentPassword: [], password: [], passwordConfirmation: [] },
};

export type EmailChangeFieldErrors = { currentPassword: string[]; email: string[] };

export type EmailChangeActionState = {
  status: Exclude<SecurityStatus, "pending-verification">;
  message: string | null;
  fieldErrors: EmailChangeFieldErrors;
};

export const INITIAL_EMAIL_CHANGE_STATE: EmailChangeActionState = {
  status: "idle",
  message: null,
  fieldErrors: { currentPassword: [], email: [] },
};

/**
 * Enrollment state. The provisioning URI and QR are shown once during setup and are
 * never persisted by the portal; they are only meaningful until the factor is
 * verified, and no secret is ever written to a log or a durable store.
 */
export type TotpEnrollmentState = {
  status: SecurityStatus;
  message: string | null;
  factorId: string | null;
  qrCode: string | null;
  secret: string | null;
  fieldErrors: { code: string[]; currentPassword: string[] };
};

export const INITIAL_TOTP_ENROLLMENT_STATE: TotpEnrollmentState = {
  status: "idle",
  message: null,
  factorId: null,
  qrCode: null,
  secret: null,
  fieldErrors: { code: [], currentPassword: [] },
};

export type ParsedPasswordChange =
  | { success: true; data: { currentPassword: string; password: string } }
  | { success: false; state: PasswordChangeActionState };

export function parsePasswordChangeFormData(formData: FormData): ParsedPasswordChange {
  const result = passwordChangeSchema.safeParse({
    currentPassword: singleValue(formData, "currentPassword"),
    password: singleValue(formData, "password"),
    passwordConfirmation: singleValue(formData, "passwordConfirmation"),
  });

  if (!result.success) {
    const errors = z.flattenError(result.error).fieldErrors;
    return {
      success: false,
      state: {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fieldErrors: {
          currentPassword: errors.currentPassword ?? [],
          password: errors.password ?? [],
          passwordConfirmation: errors.passwordConfirmation ?? [],
        },
      },
    };
  }

  return {
    success: true,
    data: { currentPassword: result.data.currentPassword, password: result.data.password },
  };
}

export type ParsedEmailChange =
  | { success: true; data: { currentPassword: string; email: string } }
  | { success: false; state: EmailChangeActionState };

export function parseEmailChangeFormData(formData: FormData): ParsedEmailChange {
  const result = emailChangeSchema.safeParse({
    currentPassword: singleValue(formData, "currentPassword"),
    email: singleValue(formData, "email"),
  });

  if (!result.success) {
    const errors = z.flattenError(result.error).fieldErrors;
    return {
      success: false,
      state: {
        status: "error",
        message: "Check the highlighted fields and try again.",
        fieldErrors: {
          currentPassword: errors.currentPassword ?? [],
          email: errors.email ?? [],
        },
      },
    };
  }

  return {
    success: true,
    data: { currentPassword: result.data.currentPassword, email: result.data.email },
  };
}

export type ParsedTotpCodeOnly =
  { success: true; data: { code: string } } | { success: false; fieldErrors: { code: string[] } };

/**
 * The sign-in challenge submits a code and nothing else. The factor is chosen from
 * the provider's verified factors, so accepting a factor id here would mean carrying
 * a field no consumer reads — and a field no consumer reads is a field that can be
 * dropped from a form without anything failing loudly.
 */
export function parseTotpCodeOnlyFormData(formData: FormData): ParsedTotpCodeOnly {
  const result = codeOnlySchema.safeParse({ code: singleValue(formData, "code") });
  if (!result.success) {
    const errors = z.flattenError(result.error).fieldErrors;
    return { success: false, fieldErrors: { code: errors.code ?? [] } };
  }
  return { success: true, data: result.data };
}

export type ParsedCurrentPassword =
  | { success: true; data: { currentPassword: string } }
  | { success: false; fieldErrors: { currentPassword: string[] } };

/** Reauthentication-only submissions: starting TOTP enrollment. */
export function parseCurrentPasswordFormData(formData: FormData): ParsedCurrentPassword {
  const result = currentPasswordSchema.safeParse({
    currentPassword: singleValue(formData, "currentPassword"),
  });
  if (!result.success) {
    const errors = z.flattenError(result.error).fieldErrors;
    return { success: false, fieldErrors: { currentPassword: errors.currentPassword ?? [] } };
  }
  return { success: true, data: result.data };
}

export type ParsedTotpCode =
  | { success: true; data: { factorId: string; code: string } }
  | { success: false; fieldErrors: { factorId: string[]; code: string[] } };

export function parseTotpCodeFormData(formData: FormData): ParsedTotpCode {
  const result = totpCodeSchema.safeParse({
    factorId: singleValue(formData, "factorId"),
    code: singleValue(formData, "code"),
  });

  if (!result.success) {
    const errors = z.flattenError(result.error).fieldErrors;
    return {
      success: false,
      fieldErrors: { factorId: errors.factorId ?? [], code: errors.code ?? [] },
    };
  }

  return { success: true, data: result.data };
}

export type ParsedFactorRemoval =
  | { success: true; data: { currentPassword: string; factorId: string } }
  | { success: false; fieldErrors: { currentPassword: string[]; factorId: string[] } };

export function parseFactorRemovalFormData(formData: FormData): ParsedFactorRemoval {
  const result = factorRemovalSchema.safeParse({
    currentPassword: singleValue(formData, "currentPassword"),
    factorId: singleValue(formData, "factorId"),
  });

  if (!result.success) {
    const errors = z.flattenError(result.error).fieldErrors;
    return {
      success: false,
      fieldErrors: {
        currentPassword: errors.currentPassword ?? [],
        factorId: errors.factorId ?? [],
      },
    };
  }

  return { success: true, data: result.data };
}
