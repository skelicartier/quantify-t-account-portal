"use client";

import { useActionState } from "react";
import Link from "next/link";

import { INITIAL_RESET_PASSWORD_STATE, type ResetPasswordAction } from "@/lib/auth/recovery";

type ResetPasswordFormProps = {
  action: ResetPasswordAction;
  token?: string | undefined;
};

export function ResetPasswordForm({ action, token }: ResetPasswordFormProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_RESET_PASSWORD_STATE);
  const passwordError = state.fieldErrors.password[0];
  const confirmationError = state.fieldErrors.passwordConfirmation[0];

  if (state.status === "success") {
    return (
      <div className="auth-alert auth-alert--success" role="status">
        {state.message} <Link href="/login?notice=password-updated">Sign in</Link>
      </div>
    );
  }

  return (
    <>
      <form className="auth-form" action={formAction} noValidate>
        {token && <input type="hidden" name="token" value={token} />}
        <div className="field-group">
          <div className="field-label-row">
            <label htmlFor="reset-password">New password</label>
            <span>Use 12–128 characters</span>
          </div>
          <input
            id="reset-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            disabled={isPending}
            aria-invalid={Boolean(passwordError)}
            aria-describedby={passwordError ? "reset-password-error" : undefined}
          />
          {passwordError && (
            <p className="field-error" id="reset-password-error">
              {passwordError}
            </p>
          )}
        </div>

        <div className="field-group">
          <label htmlFor="reset-password-confirmation">Confirm new password</label>
          <input
            id="reset-password-confirmation"
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            disabled={isPending}
            aria-invalid={Boolean(confirmationError)}
            aria-describedby={confirmationError ? "reset-password-confirmation-error" : undefined}
          />
          {confirmationError && (
            <p className="field-error" id="reset-password-confirmation-error">
              {confirmationError}
            </p>
          )}
        </div>

        <button className="button button--primary" type="submit" disabled={isPending}>
          {isPending ? "Updating password…" : "Update password"}
        </button>
      </form>

      {state.message && (
        <div className="auth-alert" role="alert">
          {state.message}
        </div>
      )}
    </>
  );
}
