"use client";

import Link from "@/components/ui/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, describedBy } from "@/components/ui/field";
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
      <div className="auth-form">
        <Callout tone="success" role="status" title="Password updated">
          {state.message}{" "}
          <Link className="text-link" href="/login?notice=password-updated">
            Sign in
          </Link>
        </Callout>
      </div>
    );
  }

  return (
    <>
      <form className="auth-form" action={formAction} noValidate>
        {token && <input type="hidden" name="token" value={token} />}
        <Field
          id="reset-password"
          label="New password"
          note="12–128 characters"
          error={passwordError}
        >
          <Input
            id="reset-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            disabled={isPending}
            invalid={Boolean(passwordError)}
            aria-describedby={describedBy("reset-password", { error: passwordError })}
          />
        </Field>

        <Field
          id="reset-password-confirmation"
          label="Confirm new password"
          error={confirmationError}
        >
          <Input
            id="reset-password-confirmation"
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            disabled={isPending}
            invalid={Boolean(confirmationError)}
            aria-describedby={describedBy("reset-password-confirmation", {
              error: confirmationError,
            })}
          />
        </Field>

        <Button variant="primary" type="submit" block disabled={isPending}>
          {isPending ? "Updating password…" : "Update password"}
        </Button>
      </form>

      {state.message && (
        <Callout tone="danger" role="alert" compact className="auth__note">
          {state.message}
        </Callout>
      )}
    </>
  );
}
