"use client";

import { useActionState } from "react";

import { TurnstileField } from "@/components/auth/turnstile-field";
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
      <div className="auth-alert auth-alert--success" role="status">
        {state.message}
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
        <div className="field-group">
          <label htmlFor="signup-email">Email address</label>
          <input
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
            aria-invalid={Boolean(emailError)}
            aria-describedby={emailError ? "signup-email-error" : undefined}
          />
          {emailError && (
            <p className="field-error" id="signup-email-error">
              {emailError}
            </p>
          )}
        </div>

        <div className="field-group">
          <div className="field-label-row">
            <label htmlFor="signup-password">Password</label>
            <span>Use 12–128 characters</span>
          </div>
          <input
            id="signup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Create a password"
            minLength={12}
            maxLength={128}
            required
            disabled={isPending}
            aria-invalid={Boolean(passwordError)}
            aria-describedby={passwordError ? "signup-password-error" : undefined}
          />
          {passwordError && (
            <p className="field-error" id="signup-password-error">
              {passwordError}
            </p>
          )}
        </div>

        <div className="field-group">
          <label htmlFor="signup-password-confirmation">Confirm password</label>
          <input
            id="signup-password-confirmation"
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            placeholder="Enter the same password"
            minLength={12}
            maxLength={128}
            required
            disabled={isPending}
            aria-invalid={Boolean(confirmationError)}
            aria-describedby={confirmationError ? "signup-confirmation-error" : undefined}
          />
          {confirmationError && (
            <p className="field-error" id="signup-confirmation-error">
              {confirmationError}
            </p>
          )}
        </div>

        <div className="checkbox-field">
          <input
            id="legal-consent"
            name={LEGAL_CONSENT_FIELD_NAME}
            type="checkbox"
            required
            disabled={isPending}
            aria-invalid={Boolean(consentError)}
            aria-describedby={consentError ? "legal-consent-error" : undefined}
          />
          <label htmlFor="legal-consent">
            I agree to the{" "}
            <a href={TERMS_URL} target="_blank" rel="noreferrer">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
              Privacy Policy
            </a>
            .
          </label>
          {consentError && (
            <p className="field-error" id="legal-consent-error">
              {consentError}
            </p>
          )}
        </div>

        <TurnstileField siteKey={turnstileSiteKey} error={challengeError} disabled={isPending} />

        <button className="button button--primary" type="submit" disabled={isPending}>
          {isPending ? "Creating account…" : "Create account"}
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
