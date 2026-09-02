import { z } from "zod";

/**
 * One password policy for every surface that sets a password.
 *
 * Recovery reset, the authenticated password change, and any future flow must
 * share these bounds so a weaker rule cannot be introduced on a second screen.
 */
export const PASSWORD_MINIMUM_LENGTH = 12;
export const PASSWORD_MAXIMUM_LENGTH = 128;

/** Existing passwords are only ever verified, never created, so bound them loosely. */
export const EXISTING_PASSWORD_MAXIMUM_LENGTH = 1_024;

export const PASSWORD_MISMATCH_MESSAGE = "Passwords do not match.";
export const PASSWORD_REUSE_MESSAGE = "Choose a new password that differs from your current one.";

export function newPasswordSchema(missingMessage = "Enter a new password.") {
  return z
    .string({ error: missingMessage })
    .min(PASSWORD_MINIMUM_LENGTH, `Use at least ${PASSWORD_MINIMUM_LENGTH} characters.`)
    .max(
      PASSWORD_MAXIMUM_LENGTH,
      `Password must be ${PASSWORD_MAXIMUM_LENGTH} characters or fewer.`,
    );
}

export function existingPasswordSchema(missingMessage = "Enter your current password.") {
  return z
    .string({ error: missingMessage })
    .min(1, missingMessage)
    .max(EXISTING_PASSWORD_MAXIMUM_LENGTH, "Password is too long.");
}
