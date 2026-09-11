"use client";

import Link from "next/link";
import { useActionState } from "react";

import { TurnstileField } from "@/components/auth/turnstile-field";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, describedBy } from "@/components/ui/field";
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
        <h2>Enter your authenticator code</h2>
        <input type="hidden" name="next" value={nextPath} />
        <Field id="login-totp-code" label="Authenticator code" hint={prompt} error={codeError}>
          <Input
            id="login-totp-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern={`\\d{${TOTP_CODE_LENGTH}}`}
            maxLength={TOTP_CODE_LENGTH}
            autoFocus
            required
            disabled={isPending}
            invalid={Boolean(codeError)}
            aria-describedby={describedBy("login-totp-code", { hint: prompt, error: codeError })}
          />
        </Field>
        <Button variant="primary" type="submit" block disabled={isPending}>
          {isPending ? "Verifying code…" : "Verify and continue"}
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
        <Field id="email" label="Email address" error={emailError}>
          <Input
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
            invalid={Boolean(emailError)}
            aria-describedby={describedBy("email", { error: emailError })}
          />
        </Field>
        <Field id="password" label="Password" error={passwordError}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            maxLength={1_024}
            required
            disabled={isPending}
            invalid={Boolean(passwordError)}
            aria-describedby={describedBy("password", { error: passwordError })}
          />
          <Link className="field__assist" href="/forgot-password">
            Forgot password?
          </Link>
        </Field>
        <TurnstileField siteKey={turnstileSiteKey} error={challengeError} disabled={isPending} />
        <Button variant="primary" type="submit" block disabled={isPending}>
          {isPending ? "Verifying account…" : "Sign in securely"}
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
