"use client";

import { useActionState } from "react";

import {
  INITIAL_ADMIN_USER_SESSION_REVOCATION_STATE,
  type AdminUserSessionRevocationState,
} from "@/lib/admin/user-session-revocation";

type AdminUserSessionRevokeFormProps = {
  action: (
    state: AdminUserSessionRevocationState,
    formData: FormData,
  ) => Promise<AdminUserSessionRevocationState>;
  sessionId: string;
  userId: string;
};

export function AdminUserSessionRevokeForm({
  action,
  sessionId,
  userId,
}: AdminUserSessionRevokeFormProps) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_ADMIN_USER_SESSION_REVOCATION_STATE,
  );

  return (
    <form className="admin-inline-form admin-inline-form--table" action={formAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="sessionId" value={sessionId} />
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Revoking..." : "Revoke"}
      </button>
      {state.message && (
        <p className={`admin-action-message admin-action-message--${state.status}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
