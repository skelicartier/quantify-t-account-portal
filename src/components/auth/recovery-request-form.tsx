"use client";

import { useActionState } from "react";

import { TurnstileField } from "@/components/auth/turnstile-field";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, describedBy } from "@/components/ui/field";
import { INITIAL_RECOVERY_REQUEST_STATE, type RecoveryRequestAction } from "@/lib/auth/recovery";

type RecoveryRequestFormProps = {
  action: RecoveryRequestAction;
  turnstileSiteKey: string;
};

export function RecoveryRequestForm({ action, turnstileSiteKey }: RecoveryRequestFormProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_RECOVERY_REQUEST_STATE);

  if (state.status === "accepted") {
    return (
      <div className="auth-form">
        <Callout tone="success" role="status" title="Request received">
          {state.message}
        </Callout>
      </div>
    );
  }

  const emailError = state.fieldErrors.email[0];
  const challengeError = state.fieldErrors.challenge[0];

  return (
    <>
      <form className="auth-form" action={formAction} noValidate>
        <Field id="recovery-email" label="Email address" error={emailError}>
          <Input
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
            invalid={Boolean(emailError)}
            aria-describedby={describedBy("recovery-email", { error: emailError })}
          />
        </Field>

        <TurnstileField siteKey={turnstileSiteKey} error={challengeError} disabled={isPending} />

        <Button variant="primary" type="submit" block disabled={isPending}>
          {isPending ? "Sending recovery email…" : "Send recovery email"}
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
