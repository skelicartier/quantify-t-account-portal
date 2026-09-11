"use client";

import { useActionState } from "react";

import { TurnstileField } from "@/components/auth/turnstile-field";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, describedBy } from "@/components/ui/field";
import { LEGAL_CONSENT_FIELD_NAME, PRIVACY_URL, TERMS_URL } from "@/lib/auth/consent";
import { INITIAL_SIGNUP_STATE, type SignupAction } from "@/lib/auth/signup";

type SignupFormProps = {
  action: SignupAction;
  turnstileSiteKey: string;
};

export function SignupForm({ action, turnstileSiteKey }: SignupFormProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_SIGNUP_STATE);

  if (state.status === "accepted") {
    return (
      <div className="auth-form">
        <Callout tone="success" role="status" title="Almost there">
          {state.message}
        </Callout>
      </div>
    );
  }

  const emailError = state.fieldErrors.email[0];
  const passwordError = state.fieldErrors.password[0];
  const confirmationError = state.fieldErrors.passwordConfirmation[0];
  const consentError = state.fieldErrors.legalConsent[0];
  const challengeError = state.fieldErrors.challenge[0];

  return (
    <>
      <form className="auth-form" action={formAction} noValidate>
        <Field id="signup-email" label="Email address" error={emailError}>
          <Input
            id="signup-email"
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
            aria-describedby={describedBy("signup-email", { error: emailError })}
          />
        </Field>

        <Field id="signup-password" label="Password" note="12–128 characters" error={passwordError}>
          <Input
            id="signup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Create a password"
            minLength={12}
            maxLength={128}
            required
            disabled={isPending}
            invalid={Boolean(passwordError)}
            aria-describedby={describedBy("signup-password", { error: passwordError })}
          />
        </Field>

        <Field id="signup-password-confirmation" label="Confirm password" error={confirmationError}>
          <Input
            id="signup-password-confirmation"
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            placeholder="Enter the same password"
            minLength={12}
            maxLength={128}
            required
            disabled={isPending}
            invalid={Boolean(confirmationError)}
            aria-describedby={describedBy("signup-password-confirmation", {
              error: confirmationError,
            })}
          />
        </Field>

        <div className="checkbox">
          <input
            id="legal-consent"
            name={LEGAL_CONSENT_FIELD_NAME}
            type="checkbox"
            required
            disabled={isPending}
            aria-invalid={Boolean(consentError)}
            aria-describedby={consentError ? "legal-consent-error" : undefined}
          />
          <label className="checkbox__label" htmlFor="legal-consent">
            I agree to the{" "}
            <a className="text-link" href={TERMS_URL} target="_blank" rel="noreferrer">
              Terms of Service
            </a>{" "}
            and{" "}
            <a className="text-link" href={PRIVACY_URL} target="_blank" rel="noreferrer">
              Privacy Policy
            </a>
            .
          </label>
          {consentError && (
            <p className="field__error checkbox__desc" id="legal-consent-error">
              {consentError}
            </p>
          )}
        </div>

        <TurnstileField siteKey={turnstileSiteKey} error={challengeError} disabled={isPending} />

        <Button variant="primary" type="submit" block disabled={isPending}>
          {isPending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      {state.message && (
        <Callout tone="danger" role="alert" compact className="auth-card__hint">
          {state.message}
        </Callout>
      )}
    </>
  );
}
