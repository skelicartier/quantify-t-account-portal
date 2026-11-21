"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Textarea } from "@/components/ui/field";
import {
  ACCESS_REASON_MAX,
  INITIAL_ADMIN_USER_ACCESS_STATE,
  type AccessStatusValue,
  type AdminUserAccessState,
} from "@/lib/admin/user-access";

export type AdminUserAccessAction = (
  state: AdminUserAccessState,
  formData: FormData,
) => Promise<AdminUserAccessState>;

type AdminUserAccessFormProps = {
  userId: string;
  current: AccessStatusValue;
  action: AdminUserAccessAction;
};

/**
 * Approve or decline one application. Both buttons submit the same form; the one pressed
 * names the decision. Only the decisions that would change something are offered, so an
 * approved account shows no Approve button to press by mistake.
 */
export function AdminUserAccessForm({ userId, current, action }: AdminUserAccessFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ADMIN_USER_ACCESS_STATE);
  const fieldId = `access-reason-${userId}`;
  const canApprove = current !== "approved";
  const canDecline = current !== "declined";

  return (
    <form className="stack stack--tight" action={formAction}>
      <input type="hidden" name="userId" value={userId} />
      <Field
        id={fieldId}
        label="Reason"
        hint={
          canDecline
            ? "Kept with the decision and shown to staff. Needed to decline; optional to approve."
            : "Kept with the decision and shown to staff. Optional."
        }
      >
        <Textarea
          id={fieldId}
          name="reason"
          rows={3}
          maxLength={ACCESS_REASON_MAX}
          disabled={pending}
          aria-describedby={`${fieldId}-hint`}
        />
      </Field>
      {canDecline && (
        <p className="field__hint">
          Declining signs the account out everywhere, stops any live trading on it, and emails the
          applicant.
        </p>
      )}
      {state.message && (
        <Callout
          tone={state.status === "error" ? "danger" : "success"}
          role={state.status === "error" ? "alert" : "status"}
          compact
        >
          {state.message}
        </Callout>
      )}
      <div className="form-actions">
        {canApprove && (
          <Button
            variant="primary"
            type="submit"
            name="decision"
            value="approved"
            disabled={pending}
          >
            {pending ? "Saving…" : current === "declined" ? "Approve after all" : "Approve"}
          </Button>
        )}
        {canDecline && (
          <Button
            variant="danger"
            type="submit"
            name="decision"
            value="declined"
            disabled={pending}
          >
            {pending ? "Saving…" : current === "approved" ? "Withdraw access" : "Decline"}
          </Button>
        )}
      </div>
    </form>
  );
}

type AdminUserQuickApproveFormProps = {
  userId: string;
  /** Who is being approved, for the button's accessible name in a table of them. */
  name: string;
  action: AdminUserAccessAction;
};

/**
 * One-press approval from the directory row. Declining is deliberately not here: it needs
 * a reason and ends sessions, so it is done on the account's own page.
 */
export function AdminUserQuickApproveForm({
  userId,
  name,
  action,
}: AdminUserQuickApproveFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ADMIN_USER_ACCESS_STATE);
  return (
    <form className="inline-actions" action={formAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="decision" value="approved" />
      <Button
        variant="primary"
        size="small"
        type="submit"
        disabled={pending || state.status === "success"}
        aria-label={`Approve ${name}`}
      >
        {pending ? "Approving…" : state.status === "success" ? "Approved" : "Approve"}
      </Button>
      {state.status === "error" && (
        <span className="field__error" role="alert">
          {state.message}
        </span>
      )}
    </form>
  );
}
