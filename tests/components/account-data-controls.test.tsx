import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AccountDataControls } from "@/components/account/account-data-controls";
import {
  ACCOUNT_DELETION_CANCEL_CONFIRMATION,
  ACCOUNT_EXPORT_CONFIRMATION,
  INITIAL_ACCOUNT_LIFECYCLE_STATE,
  type AccountLifecycleActionState,
} from "@/lib/account/lifecycle-input";
import type { AccountApiAccountLifecycle } from "@/lib/admin/account-api";

const lifecycle: AccountApiAccountLifecycle = {
  ok: true,
  correlation_id: "qt-lifecycle",
  revision: "lifecycle-revision-123456",
  generated_at: "2026-09-06T01:00:00Z",
  export_queue: { job_limit: 50, returned: 1, per_user_limit: 10 },
  exports: [
    {
      id: "24000000-0000-4000-8000-000000000001",
      format: "json",
      status: "ready",
      requested_at: "2026-09-06T01:00:00Z",
      generated_at: "2026-09-06T01:01:00Z",
      expires_at: "2026-09-13T01:00:00Z",
      attempts: 1,
      max_attempts: 3,
      next_attempt_at: "",
      last_error: "",
      byte_count: 256,
      sections: ["profile", "sessions"],
      download: {
        available: true,
        private: true,
        encrypted: true,
        source_locked: true,
        content_type: "application/octet-stream",
        filename: "quantify-account-export-24000000-0000-4000-8000-000000000001.json.enc",
        expires_at: "2026-09-06T01:15:00Z",
        ttl_seconds: 900,
        byte_count: 256,
        sha256: "a".repeat(64),
        url: null,
      },
    },
  ],
  deletion: {
    active: {
      id: "25000000-0000-4000-8000-000000000001",
      status: "pending",
      requested_at: "2026-09-06T01:00:00Z",
      scheduled_delete_at: "2026-09-20T01:00:00Z",
      cancelled_at: "",
      completed_at: "",
      cooling_off_seconds: 1_209_600,
      can_cancel: true,
      legal_hold: false,
      hold_reason: "",
      cleanup: {
        sessions: "pending",
        storage: "pending",
        azure: "pending",
        auth: "pending",
        audit_tombstone: "pending",
      },
      attempts: 0,
      max_attempts: 3,
      next_attempt_at: "",
      last_error: "",
      hold: null,
      offline_desktop_cache_note: "not-remotely-deletable",
    },
    requests: [],
  },
};

function successAction(state: AccountLifecycleActionState, formData: FormData) {
  void state;
  void formData;
  return Promise.resolve({
    ...INITIAL_ACCOUNT_LIFECYCLE_STATE,
    status: "success" as const,
    message: "Done",
  });
}

it("renders private export and deletion state without URLs", async () => {
  render(
    <AccountDataControls
      lifecycle={lifecycle}
      requestExportAction={successAction}
      requestDeletionAction={successAction}
      cancelDeletionAction={successAction}
    />,
  );

  expect(screen.getByRole("heading", { name: "Data" })).toBeVisible();
  expect(screen.getByText("Private descriptor ready")).toBeVisible();
  expect(screen.getByText(/Status pending/u)).toBeVisible();
  expect(screen.queryByText(/https?:\/\//iu)).not.toBeInTheDocument();
});

it("submits export and cancellation forms with current revision", async () => {
  const user = userEvent.setup();
  const requestExportAction = vi.fn(successAction);
  const cancelDeletionAction = vi.fn(successAction);

  render(
    <AccountDataControls
      lifecycle={lifecycle}
      requestExportAction={requestExportAction}
      requestDeletionAction={successAction}
      cancelDeletionAction={cancelDeletionAction}
    />,
  );

  const exportSection = screen.getByRole("heading", { name: "Account export" }).closest("section")!;
  await user.type(within(exportSection).getByLabelText(/current password/i), "pw");
  await user.type(
    within(exportSection).getByLabelText(/confirmation/i),
    ACCOUNT_EXPORT_CONFIRMATION,
  );
  await user.click(within(exportSection).getByRole("button", { name: /request export/i }));

  expect(requestExportAction).toHaveBeenCalled();
  const exportForm = requestExportAction.mock.calls[0]?.[1] as FormData;
  expect(exportForm.get("revision")).toBe(lifecycle.revision);
  expect(exportForm.get("confirmation")).toBe(ACCOUNT_EXPORT_CONFIRMATION);

  const deletionSection = screen
    .getByRole("heading", { name: "Controlled deletion" })
    .closest("section")!;
  await user.type(within(deletionSection).getByLabelText(/current password/i), "pw");
  await user.type(
    within(deletionSection).getByLabelText(/confirmation/i),
    ACCOUNT_DELETION_CANCEL_CONFIRMATION,
  );
  await user.click(within(deletionSection).getByRole("button", { name: /cancel deletion/i }));

  const cancelForm = cancelDeletionAction.mock.calls[0]?.[1] as FormData;
  expect(cancelForm.get("revision")).toBe(lifecycle.revision);
  expect(cancelForm.get("requestId")).toBe(lifecycle.deletion.active!.id);
});

it("confirms a deletion request with what the erasure removes and what it keeps", async () => {
  const user = userEvent.setup();
  const requestDeletionAction = vi.fn(async () => ({
    ...INITIAL_ACCOUNT_LIFECYCLE_STATE,
    status: "success" as const,
    message: "Deletion request created.",
    erasure: {
      erased:
        "When the cooling-off period ends, every record this service holds about you is erased.",
      kept: ["A record that an erasure happened.", "Records the law requires us to keep."],
    },
  }));

  render(
    <AccountDataControls
      lifecycle={{ ...lifecycle, deletion: { active: null, requests: [] } }}
      requestExportAction={successAction}
      requestDeletionAction={requestDeletionAction}
      cancelDeletionAction={successAction}
    />,
  );

  const deletionSection = screen
    .getByRole("heading", { name: "Controlled deletion" })
    .closest("section")!;
  await user.type(within(deletionSection).getByLabelText(/current password/i), "pw");
  await user.type(within(deletionSection).getByLabelText(/confirmation/i), "DELETE MY ACCOUNT");
  await user.click(within(deletionSection).getByRole("button", { name: /request deletion/i }));

  const confirmation = await screen.findByRole("status");
  expect(confirmation).toHaveTextContent("Deletion requested");
  expect(within(confirmation).getByRole("heading", { name: "What is erased" })).toBeVisible();
  expect(confirmation).toHaveTextContent("every record this service holds about you is erased");
  expect(within(confirmation).getByRole("heading", { name: "What is kept" })).toBeVisible();
  expect(within(confirmation).getAllByRole("listitem")).toHaveLength(2);
});

it("says a due deletion is waiting for the brokers to confirm their cancels, and stays cancellable", () => {
  const active = lifecycle.deletion.active!;
  const held = {
    ...active,
    status: "blocked" as const,
    can_cancel: true,
    cleanup: { ...active.cleanup, brokers: "held" as const },
    last_error: "waiting for the broker to confirm cancellation",
    next_attempt_at: "2026-09-20T01:15:00Z",
    hold: {
      code: "broker_cancellation",
      next_check_at: "2026-09-20T01:15:00Z",
      held_until: "2026-09-23T01:00:00Z",
    },
  };
  render(
    <AccountDataControls
      lifecycle={{ ...lifecycle, deletion: { active: held, requests: [held] } }}
      requestExportAction={successAction}
      requestDeletionAction={successAction}
      cancelDeletionAction={successAction}
    />,
  );

  const hold = screen.getByText("Deletion is waiting for your brokers").closest(".callout")!;
  expect(hold).toHaveClass("callout--attention");
  expect(hold).toHaveTextContent("every working order has been asked to cancel");
  expect(hold).toHaveTextContent("Next check");
  expect(hold).toHaveTextContent("the erasure goes ahead without that confirmation");
  expect(screen.getByRole("button", { name: /cancel deletion/i })).toBeEnabled();
  expect(screen.getByText("Waiting for brokers to confirm cancellation.")).toBeVisible();
});

it("reads the hold from its code, not from the wording of the last error", () => {
  const active = lifecycle.deletion.active!;
  const blocked = {
    ...active,
    status: "blocked" as const,
    last_error: "waiting for the broker to confirm cancellation",
    hold: null,
  };
  render(
    <AccountDataControls
      lifecycle={{ ...lifecycle, deletion: { active: blocked, requests: [blocked] } }}
      requestExportAction={successAction}
      requestDeletionAction={successAction}
      cancelDeletionAction={successAction}
    />,
  );

  expect(screen.queryByText("Deletion is waiting for your brokers")).toBeNull();
  expect(screen.getByText("Deletion has not completed")).toBeVisible();
});
