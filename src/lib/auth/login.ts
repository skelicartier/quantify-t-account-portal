import { z } from "zod";

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
});

export type LoginActionState = {
  status: "idle" | "error";
  message: string | null;
  fieldErrors: {
    email: string[];
    password: string[];
  };
};

export type LoginAction = (
  previousState: LoginActionState,
  formData: FormData,
) => Promise<LoginActionState>;

export const INITIAL_LOGIN_STATE: LoginActionState = {
  status: "idle",
  message: null,
  fieldErrors: { email: [], password: [] },
};

export function sanitizeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/account";

  try {
    const base = new URL("https://account.quantifyterminal.invalid");
    const destination = new URL(value, base);
    const isAccountPath =
      destination.pathname === "/account" || destination.pathname.startsWith("/account/");

    if (destination.origin !== base.origin || !isAccountPath) return "/account";
    return `${destination.pathname}${destination.search}`;
  } catch {
    return "/account";
  }
}

const CREDENTIAL_REJECTION_CODES = new Set([
  "email_not_confirmed",
  "invalid_credentials",
  "invalid_grant",
  "user_banned",
  "user_not_found",
]);

export function isCredentialRejection(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && CREDENTIAL_REJECTION_CODES.has(code);
}

export type ParsedLoginForm =
  | {
      success: true;
      data: { email: string; password: string; nextPath: string };
    }
  | { success: false; state: LoginActionState };

export function parseLoginFormData(formData: FormData): ParsedLoginForm {
  const result = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
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
        },
      },
    };
  }

  return {
    success: true,
    data: {
      email: result.data.email,
      password: result.data.password,
      nextPath: sanitizeNextPath(formData.get("next")),
    },
  };
}
