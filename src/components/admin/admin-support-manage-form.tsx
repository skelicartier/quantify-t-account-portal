"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Select } from "@/components/ui/field";
import {
  INITIAL_ADMIN_SUPPORT_STATE,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  supportPriorityLabel,
  supportStatusLabel,
  type AdminSupportActionState,
} from "@/lib/admin/support-input";

type SupportAction = (
  state: AdminSupportActionState,
  formData: FormData,
) => Promise<AdminSupportActionState>;

type AdminSupportManageFormProps = {
  conversationId: string;
  assigneeId: string;
  status: string;
  priority: string;
  action: SupportAction;
};

/**
 * Assign, prioritise, close — one form, because on a desk they are one job.
 *
 * The assignee field always submits, including when it is empty, because empty is a
 * meaningful instruction: it hands the conversation back to the unassigned queue. Status
 * and priority only submit when they differ from what is stored, so a save meant to
 * reassign does not also re-close a thread somebody reopened a second ago.
 */
export function AdminSupportManageForm({
  conversationId,
  assigneeId,
  status,
  priority,
  action,
}: AdminSupportManageFormProps) {
  const [state, submit, pending] = useActionState(action, INITIAL_ADMIN_SUPPORT_STATE);
  const [assignee, setAssignee] = useState(assigneeId);
  const [nextStatus, setNextStatus] = useState(status);
  const [nextPriority, setNextPriority] = useState(priority);
  const unchanged =
    assignee.trim() === assigneeId.trim() && nextStatus === status && nextPriority === priority;

  return (
    <form className="stack" action={submit}>
      <input type="hidden" name="conversationId" value={conversationId} />
      {nextStatus !== status && <input type="hidden" name="status" value={nextStatus} />}
      {nextPriority !== priority && <input type="hidden" name="priority" value={nextPriority} />}

      <Field
        id={`support-assignee-${conversationId}`}
        label="Assign to"
        hint="The staff account's id. Leave it empty to put it back in the unassigned queue."
      >
        <Input
          id={`support-assignee-${conversationId}`}
          name="assigneeId"
          value={assignee}
          onChange={(event) => setAssignee(event.target.value)}
          disabled={pending}
          spellCheck={false}
          autoComplete="off"
          placeholder="00000000-0000-0000-0000-000000000000"
        />
      </Field>

      <Field id={`support-status-${conversationId}`} label="Status">
        <Select
          id={`support-status-${conversationId}`}
          value={nextStatus}
          disabled={pending}
          onChange={(event) => setNextStatus(event.target.value)}
        >
          {SUPPORT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {supportStatusLabel(value)}
              {value === status ? " (current)" : ""}
            </option>
          ))}
        </Select>
      </Field>

      <Field id={`support-priority-${conversationId}`} label="Priority">
        <Select
          id={`support-priority-${conversationId}`}
          value={nextPriority}
          disabled={pending}
          onChange={(event) => setNextPriority(event.target.value)}
        >
          {SUPPORT_PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {supportPriorityLabel(value)}
              {value === priority ? " (current)" : ""}
            </option>
          ))}
        </Select>
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
        <Button variant="default" type="submit" disabled={pending || unchanged}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
