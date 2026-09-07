"use client";

import { useActionState } from "react";

import {
  INITIAL_ADMIN_USER_ACTIVATION_STATE,
  type AdminUserActivationState,
} from "@/lib/admin/user-activation";

type AdminUserActivationFormProps = {
  userId: string;
  isActive: boolean;
  action: (
    state: AdminUserActivationState,
    formData: FormData,
  ) => Promise<AdminUserActivationState>;
};

export function AdminUserActivationForm({
  userId,
  isActive,
  action,
}: AdminUserActivationFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ADMIN_USER_ACTIVATION_STATE);
  const nextActive = !isActive;
  return (
    <form className="admin-inline-form" action={formAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="isActive" value={String(nextActive)} />
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Updating" : nextActive ? "Activate user" : "Deactivate user"}
      </button>
      {state.message && (
        <p className="admin-action-message" role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
