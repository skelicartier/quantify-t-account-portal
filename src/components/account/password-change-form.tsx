"use client";

import { useActionState } from "react";

import {
  INITIAL_PASSWORD_CHANGE_STATE,
  type PasswordChangeActionState,
} from "@/lib/auth/security-input";
import { PASSWORD_MAXIMUM_LENGTH, PASSWORD_MINIMUM_LENGTH } from "@/lib/auth/password-policy";

type PasswordChangeFormProps = {
  action: (
    state: PasswordChangeActionState,
    formData: FormData,
  ) => Promise<PasswordChangeActionState>;
};

export function PasswordChangeForm({ action }: PasswordChangeFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_PASSWORD_CHANGE_STATE);
  return (
    <form className="account-form" action={formAction} noValidate>
      <div className="field-group">
        <label htmlFor="security-current-password">Current password</label>
        <input
          id="security-current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          aria-invalid={Boolean(state.fieldErrors.currentPassword[0])}
          aria-describedby={
            state.fieldErrors.currentPassword[0] ? "security-current-password-error" : undefined
          }
        />
        {state.fieldErrors.currentPassword[0] && (
          <p className="field-error" id="security-current-password-error">
            {state.fieldErrors.currentPassword[0]}
          </p>
        )}
      </div>
      <div className="field-group">
        <label htmlFor="security-new-password">New password</label>
        <input
          id="security-new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MINIMUM_LENGTH}
          maxLength={PASSWORD_MAXIMUM_LENGTH}
          required
          disabled={pending}
          aria-invalid={Boolean(state.fieldErrors.password[0])}
          aria-describedby={
            state.fieldErrors.password[0] ? "security-new-password-error" : "security-password-help"
          }
        />
        <p className="field-help" id="security-password-help">
          Use at least {PASSWORD_MINIMUM_LENGTH} characters and something you have not used here
          before.
        </p>
        {state.fieldErrors.password[0] && (
          <p className="field-error" id="security-new-password-error">
            {state.fieldErrors.password[0]}
          </p>
        )}
      </div>
      <div className="field-group">
        <label htmlFor="security-confirm-password">Confirm new password</label>
        <input
          id="security-confirm-password"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          maxLength={PASSWORD_MAXIMUM_LENGTH}
          required
          disabled={pending}
          aria-invalid={Boolean(state.fieldErrors.passwordConfirmation[0])}
          aria-describedby={
            state.fieldErrors.passwordConfirmation[0]
              ? "security-confirm-password-error"
              : undefined
          }
        />
        {state.fieldErrors.passwordConfirmation[0] && (
          <p className="field-error" id="security-confirm-password-error">
            {state.fieldErrors.passwordConfirmation[0]}
          </p>
        )}
      </div>
      {state.message && (
        <p
          className={`account-form__status account-form__status--${state.status}`}
          role={state.status === "success" ? "status" : "alert"}
        >
          {state.message}
        </p>
      )}
      <button className="button button--primary" type="submit" disabled={pending}>
        {pending ? "Updating password…" : "Update password"}
      </button>
    </form>
  );
}
