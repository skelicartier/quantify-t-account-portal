"use client";

import Link from "next/link";
import { useActionState } from "react";

import { TurnstileField } from "@/components/auth/turnstile-field";

import {
  INITIAL_LOGIN_CHALLENGE_STATE,
  INITIAL_LOGIN_STATE,
  type LoginAction,
  type LoginChallengeAction,
} from "@/lib/auth/login";
import { TOTP_CODE_LENGTH } from "@/lib/auth/security-input";

type LoginFormProps = {
  action: LoginAction;
  challengeAction: LoginChallengeAction;
  nextPath: string;
  turnstileSiteKey: string;
};

function LoginChallengeForm({
  action,
  nextPath,
  prompt,
}: {
  action: LoginChallengeAction;
  nextPath: string;
  prompt: string | null;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_LOGIN_CHALLENGE_STATE);
  const codeError = state.fieldErrors.code[0];

  return (
    <>
      <form className="auth-form" action={formAction} noValidate>
        <input type="hidden" name="next" value={nextPath} />
        <div className="field-group">
          <label htmlFor="login-totp-code">Authenticator code</label>
          <input
            id="login-totp-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern={`\\d{${TOTP_CODE_LENGTH}}`}
            maxLength={TOTP_CODE_LENGTH}
            autoFocus
            required
            disabled={isPending}
            aria-invalid={Boolean(codeError)}
            aria-describedby={codeError ? "login-totp-code-error" : "login-totp-help"}
          />
          {prompt && (
            <p className="field-help" id="login-totp-help">
              {prompt}
            </p>
          )}
          {codeError && (
            <p className="field-error" id="login-totp-code-error">
              {codeError}
            </p>
          )}
        </div>
        <button className="button button--primary" type="submit" disabled={isPending}>
          {isPending ? "Verifying code…" : "Verify and continue"}
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

export function LoginForm({ action, challengeAction, nextPath, turnstileSiteKey }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_LOGIN_STATE);
  const emailError = state.fieldErrors.email[0];
  const passwordError = state.fieldErrors.password[0];
  const challengeError = state.fieldErrors.challenge[0];

  // The password was accepted but the session still owes a second factor, so the
  // credential form is replaced rather than supplemented: there is nothing left to
  // re-submit, and re-posting the password would start a fresh sign-in.
  if (state.status === "mfa-required") {
    return (
      <LoginChallengeForm action={challengeAction} nextPath={nextPath} prompt={state.message} />
    );
  }

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
