"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, describedBy } from "@/components/ui/field";
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
  const errors = state.fieldErrors;
  const passwordHint = `Use at least ${PASSWORD_MINIMUM_LENGTH} characters and something you have not used here before.`;
  return (
    <form className="form" action={formAction} noValidate>
      <Field
        id="security-current-password"
        label="Current password"
        error={errors.currentPassword[0]}
      >
        <Input
          id="security-current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          invalid={Boolean(errors.currentPassword[0])}
          aria-describedby={describedBy("security-current-password", {
            error: errors.currentPassword[0],
          })}
        />
      </Field>
      <Field
        id="security-new-password"
        label="New password"
        hint={passwordHint}
        error={errors.password[0]}
      >
        <Input
          id="security-new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MINIMUM_LENGTH}
          maxLength={PASSWORD_MAXIMUM_LENGTH}
          required
          disabled={pending}
          invalid={Boolean(errors.password[0])}
          aria-describedby={describedBy("security-new-password", {
            hint: passwordHint,
            error: errors.password[0],
          })}
        />
      </Field>
      <Field
        id="security-confirm-password"
        label="Confirm new password"
        error={errors.passwordConfirmation[0]}
      >
        <Input
          id="security-confirm-password"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          maxLength={PASSWORD_MAXIMUM_LENGTH}
          required
          disabled={pending}
          invalid={Boolean(errors.passwordConfirmation[0])}
          aria-describedby={describedBy("security-confirm-password", {
            error: errors.passwordConfirmation[0],
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
          {pending ? "Updating password…" : "Update password"}
        </Button>
      </div>
    </form>
  );
}
