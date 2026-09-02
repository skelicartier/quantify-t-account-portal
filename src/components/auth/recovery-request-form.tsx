"use client";

import { useActionState } from "react";

import { TurnstileField } from "@/components/auth/turnstile-field";
import { INITIAL_RECOVERY_REQUEST_STATE, type RecoveryRequestAction } from "@/lib/auth/recovery";

type RecoveryRequestFormProps = {
  action: RecoveryRequestAction;
  turnstileSiteKey: string;
};

export function RecoveryRequestForm({ action, turnstileSiteKey }: RecoveryRequestFormProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_RECOVERY_REQUEST_STATE);

  if (state.status === "accepted") {
    return (
      <div className="auth-alert auth-alert--success" role="status">
        {state.message}
      </div>
    );
  }

  const emailError = state.fieldErrors.email[0];
  const challengeError = state.fieldErrors.challenge[0];

  return (
    <>
      <form className="auth-form" action={formAction} noValidate>
        <div className="field-group">
          <label htmlFor="recovery-email">Email address</label>
          <input
            id="recovery-email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="name@company.com"
            maxLength={254}
            required
            disabled={isPending}
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? "recovery-email-error" : undefined}
          />
          {emailError && (
            <p className="field-error" id="recovery-email-error">
              {emailError}
            </p>
          )}
        </div>

        <TurnstileField siteKey={turnstileSiteKey} error={challengeError} disabled={isPending} />

        <button className="button button--primary" type="submit" disabled={isPending}>
          {isPending ? "Sending recovery email…" : "Send recovery email"}
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
