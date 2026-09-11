import { z } from "zod";

import {
  CHALLENGE_ERROR_MESSAGE,
  CHALLENGE_FIELD_NAME,
  MAX_CHALLENGE_TOKEN_LENGTH,
} from "@/lib/auth/challenge";
import {
  desktopConnectPath,
  isDesktopConnectPath,
  parseDesktopConnectParams,
} from "@/lib/auth/desktop-connect";
import { isProtectedAdminPath, isProtectedAccountPath } from "@/lib/auth/route-policy";

const loginSchema = z.object({
  email: z
    .string({ error: "Enter your email address." })
    .trim()
    .toLowerCase()
    .max(254, "Email address is too long.")
    .email("Enter a valid email address."),
  password: z
    .string({ error: "Enter your password." })
    .min(1, "Enter your password.")
    .max(1_024, "Password is too long."),
  challenge: z
    .string({ error: CHALLENGE_ERROR_MESSAGE })
    .trim()
    .max(MAX_CHALLENGE_TOKEN_LENGTH, CHALLENGE_ERROR_MESSAGE)
    .optional()
    .or(z.literal("")),
});

export type LoginActionState = {
  /**
   * `mfa-required` means the password was accepted but the session is still AAL1
   * while a verified factor exists, so the visitor must satisfy a TOTP challenge
   * before any protected route will serve them.
   */
  status: "idle" | "error" | "mfa-required";
  message: string | null;
  fieldErrors: {
    email: string[];
    password: string[];
    challenge: string[];
  };
};

export type LoginChallengeActionState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: { code: string[] };
};

export type LoginChallengeAction = (
  previousState: LoginChallengeActionState,
  formData: FormData,
) => Promise<LoginChallengeActionState>;

export const INITIAL_LOGIN_CHALLENGE_STATE: LoginChallengeActionState = {
  status: "idle",
  message: null,
  fieldErrors: { code: [] },
};

export type LoginAction = (
  previousState: LoginActionState,
  formData: FormData,
) => Promise<LoginActionState>;

export const INITIAL_LOGIN_STATE: LoginActionState = {
  status: "idle",
  message: null,
  fieldErrors: { email: [], password: [], challenge: [] },
};

export function sanitizeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/account";

  try {
    const submittedPath = value.split(/[?#]/u, 1)[0] ?? "";
    if (/%2e|%2f|%5c/i.test(submittedPath)) return "/account";

    const base = new URL("https://account.quantifyterminal.invalid");
    const destination = new URL(value, base);
    if (destination.origin !== base.origin) return "/account";

    if (isDesktopConnectPath(destination.pathname)) {
      // The desktop handoff is a destination only with a well-formed handoff in its query.
      const handoff = parseDesktopConnectParams(destination.searchParams);
      return handoff ? desktopConnectPath(handoff) : "/account";
    }
    if (
      !isProtectedAccountPath(destination.pathname) &&
      !isProtectedAdminPath(destination.pathname)
    ) {
      return "/account";
    }
    return `${destination.pathname}${destination.search}`;
  } catch {
    return "/account";
  }
}

// Re-exported so the sign-in surface keeps one import while the classification
// itself lives in a single shared module with the reauthentication path.
export { isCredentialRejection } from "@/lib/auth/credential-errors";

export type ParsedLoginForm =
  | {
      success: true;
      data: { email: string; password: string; captchaToken: string; nextPath: string };
    }
  | { success: false; state: LoginActionState };

export function parseLoginFormData(formData: FormData): ParsedLoginForm {
  const result = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
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
      captchaToken: result.data.challenge ?? "",
      nextPath: sanitizeNextPath(formData.get("next")),
    },
  };
}
