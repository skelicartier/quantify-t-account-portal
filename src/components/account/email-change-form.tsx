"use client";

import { useActionState } from "react";

import { INITIAL_EMAIL_CHANGE_STATE, type EmailChangeActionState } from "@/lib/auth/security-input";

type EmailChangeFormProps = {
  currentEmail: string | null;
  action: (state: EmailChangeActionState, formData: FormData) => Promise<EmailChangeActionState>;
};

export function EmailChangeForm({ currentEmail, action }: EmailChangeFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_EMAIL_CHANGE_STATE);
  return (
    <form className="account-form" action={formAction} noValidate>
      <div className="field-group">
        <label htmlFor="security-current-email">Current verified email</label>
        <input
          id="security-current-email"
          name="currentEmail"
          type="email"
          value={currentEmail ?? ""}
          readOnly
          disabled
          autoComplete="off"
        />
      </div>
      <div className="field-group">
        <label htmlFor="security-new-email">New email address</label>
        <input
          id="security-new-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          required
          disabled={pending}
          aria-invalid={Boolean(state.fieldErrors.email[0])}
          aria-describedby={
            state.fieldErrors.email[0] ? "security-new-email-error" : "security-email-help"
          }
        />
        <p className="field-help" id="security-email-help">
          Both your current and new address must confirm the change before it takes effect.
        </p>
        {state.fieldErrors.email[0] && (
          <p className="field-error" id="security-new-email-error">
            {state.fieldErrors.email[0]}
          </p>
        )}
      </div>
      <div className="field-group">
        <label htmlFor="security-email-password">Current password</label>
        <input
          id="security-email-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          aria-invalid={Boolean(state.fieldErrors.currentPassword[0])}
          aria-describedby={
            state.fieldErrors.currentPassword[0] ? "security-email-password-error" : undefined
          }
        />
        {state.fieldErrors.currentPassword[0] && (
          <p className="field-error" id="security-email-password-error">
            {state.fieldErrors.currentPassword[0]}
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
        {pending ? "Sending confirmations…" : "Request email change"}
      </button>
    </form>
  );
}
