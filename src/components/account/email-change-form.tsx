"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, describedBy } from "@/components/ui/field";
import { INITIAL_EMAIL_CHANGE_STATE, type EmailChangeActionState } from "@/lib/auth/security-input";

type EmailChangeFormProps = {
  currentEmail: string | null;
  action: (state: EmailChangeActionState, formData: FormData) => Promise<EmailChangeActionState>;
};

const EMAIL_HINT =
  "Both your current and new address must confirm the change before it takes effect.";

export function EmailChangeForm({ currentEmail, action }: EmailChangeFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_EMAIL_CHANGE_STATE);
  const errors = state.fieldErrors;
  return (
    <form className="form" action={formAction} noValidate>
      <Field id="security-current-email" label="Current verified email">
        <Input
          id="security-current-email"
          name="currentEmail"
          type="email"
          value={currentEmail ?? ""}
          readOnly
          disabled
          autoComplete="off"
        />
      </Field>
      <Field
        id="security-new-email"
        label="New email address"
        hint={EMAIL_HINT}
        error={errors.email[0]}
      >
        <Input
          id="security-new-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          required
          disabled={pending}
          invalid={Boolean(errors.email[0])}
          aria-describedby={describedBy("security-new-email", {
            hint: EMAIL_HINT,
            error: errors.email[0],
          })}
        />
      </Field>
      <Field
        id="security-email-password"
        label="Current password"
        error={errors.currentPassword[0]}
      >
        <Input
          id="security-email-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          invalid={Boolean(errors.currentPassword[0])}
          aria-describedby={describedBy("security-email-password", {
            error: errors.currentPassword[0],
          })}
        />
      </Field>
      {state.message && (
        <Callout
          tone={state.status === "success" ? "success" : "danger"}
          role={state.status === "success" ? "status" : "alert"}
          compact
        >
          {state.message}
        </Callout>
      )}
      <div className="form-actions">
        <Button variant="primary" type="submit" disabled={pending}>
          {pending ? "Sending confirmations…" : "Request email change"}
        </Button>
      </div>
    </form>
  );
}
