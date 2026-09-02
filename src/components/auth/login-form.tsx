"use client";

import Link from "next/link";
import { useActionState } from "react";

import { TurnstileField } from "@/components/auth/turnstile-field";

import { INITIAL_LOGIN_STATE, type LoginAction } from "@/lib/auth/login";

type LoginFormProps = {
  action: LoginAction;
  nextPath: string;
  turnstileSiteKey: string;
};

export function LoginForm({ action, nextPath, turnstileSiteKey }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_LOGIN_STATE);
  const emailError = state.fieldErrors.email[0];
  const passwordError = state.fieldErrors.password[0];
  const challengeError = state.fieldErrors.challenge[0];

  return (
    <>
      <form className="auth-form" action={formAction} noValidate>
        <input type="hidden" name="next" value={nextPath} />
        <div className="field-group">
          <label htmlFor="email">Email address</label>
          <input
            id="email"
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
            aria-describedby={emailError ? "email-error" : undefined}
          />
          {emailError && (
            <p className="field-error" id="email-error">
              {emailError}
            </p>
          )}
        </div>
        <div className="field-group">
          <div className="field-label-row">
            <label htmlFor="password">Password</label>
            <span>Use the password for your verified Quantify account</span>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            maxLength={1_024}
            required
            disabled={isPending}
            aria-invalid={Boolean(passwordError)}
            aria-describedby={passwordError ? "password-error" : undefined}
          />
          {passwordError && (
            <p className="field-error" id="password-error">
              {passwordError}
            </p>
          )}
          <Link className="field-assist-link" href="/forgot-password">
            Forgot password?
          </Link>
        </div>
        <TurnstileField siteKey={turnstileSiteKey} error={challengeError} disabled={isPending} />
        <button className="button button--primary" type="submit" disabled={isPending}>
          {isPending ? "Verifying account…" : "Sign in securely"}
        </button>
      </form>

      {state.message && (
        <div className="auth-alert" role="alert">
          {state.message}
        </div>
      )}

      <div className="foundation-status" role="status">
        <span aria-hidden="true" />
        Authentication uses a server-managed session. Passwords and session tokens are never
        returned in page data.
      </div>
    </>
  );
}
