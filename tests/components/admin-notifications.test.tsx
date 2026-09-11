import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminEmailManager } from "@/components/admin/admin-email-manager";
import { AdminNotificationManager } from "@/components/admin/admin-notification-manager";
import { AccountNotifications } from "@/components/account/account-notifications";
import type { AccountApiAdminNotificationEmailQueue } from "@/lib/admin/account-api";
import { notificationDocument } from "../fixtures/notifications";

const emailQueue: AccountApiAdminNotificationEmailQueue = {
  ok: true,
  correlation_id: "qt-email-queue",
  revision: "email-queue-revision-123456",
  generated_at: "2026-09-05T01:00:00Z",
  quota: { daily_limit: 25, queued_24h: 0, queue_limit: 500 },
  jobs: [
    {
      id: "31000000-0000-4000-8000-000000000001",
      subject: "Maintenance window",
      body: "A maintenance window is scheduled.",
      target: { mode: "all", user_ids: [], emails: [] },
      status: "queued",
      queued_at: "2026-09-05T01:00:00Z",
      scheduled_at: "2026-09-06T01:00:00Z",
      attempts: 0,
      max_attempts: 3,
      next_attempt_at: "2026-09-06T01:00:00Z",
      last_error: "",
      last_attempt_at: "",
      completed_at: "",
    },
  ],
};

it("duplicates into a paused draft and closes after a successful save", async () => {
  const user = userEvent.setup();
  const action = vi.fn(async () => ({
    status: "success" as const,
    message: "Notification saved.",
  }));
  render(<AdminNotificationManager document={notificationDocument} action={action} />);
  await user.click(screen.getByRole("button", { name: "Duplicate Scheduled maintenance" }));
  expect(screen.getByRole("checkbox", { name: "Active" })).not.toBeChecked();
  await user.click(screen.getByRole("button", { name: "Save notification" }));
  await waitFor(() => expect(action).toHaveBeenCalled());
  const data = action.mock.calls[0] as unknown as [unknown, FormData];
  expect(JSON.parse(String(data[1].get("notification")))).toMatchObject({ id: "", active: false });
  expect(screen.queryByRole("heading", { name: "New notification" })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Notification saved.");
});

it("retains the draft and original revision after a conflict and rerender", async () => {
  const user = userEvent.setup();
  const action = vi.fn(async () => ({
    status: "error" as const,
    message: "Reload before saving.",
  }));
  const { rerender } = render(
    <AdminNotificationManager document={notificationDocument} action={action} />,
  );
  await user.click(screen.getByRole("button", { name: "Edit Scheduled maintenance" }));
  await user.type(screen.getByRole("textbox", { name: "Title" }), " updated");
  await user.click(screen.getByRole("button", { name: "Save notification" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Reload");
  rerender(
    <AdminNotificationManager
      document={{ ...notificationDocument, revision: "new-revision" }}
      action={action}
    />,
  );
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(
    "Scheduled maintenance updated",
  );
  await user.click(screen.getByRole("button", { name: "Save notification" }));
  await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  const data = action.mock.calls[1] as unknown as [unknown, FormData];
  expect(data[1].get("revision")).toBe(notificationDocument.revision);
});

it("renders content as text, filters unsafe links, and submits a receipt", async () => {
  const user = userEvent.setup();
  const action = vi.fn(async () => ({ status: "success" as const, message: "Response recorded." }));
  const note = {
    ...notificationDocument.notifications[0]!,
    title: "<img src=x onerror=alert(1)>",
    actions: [
      { label: "Unsafe", url: "javascript:alert(1)", kind: "link", primary: false },
      { label: "Details", url: "https://example.test/details", kind: "link", primary: true },
    ],
  };
  const { container } = render(<AccountNotifications notifications={[note]} action={action} />);
  expect(container.querySelector("img")).toBeNull();
  expect(screen.queryByRole("link", { name: "Unsafe" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Details" })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  await user.click(screen.getByRole("button", { name: "Mark read" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Response recorded.");
  const data = action.mock.calls[0] as unknown as [unknown, FormData];
  expect(data[1].get("status")).toBe("read");
  expect(data[1].get("notificationId")).toBe(note.id);
});

it("uses persisted receipt state to hide dismissed notices and render history", () => {
  const dismissed = {
    ...notificationDocument.notifications[0]!,
    id: "notice2",
    title: "Dismissed notice",
  };
  render(
    <AccountNotifications
      notifications={[notificationDocument.notifications[0]!, dismissed]}
      receiptState={{
        state: [
          {
            notification_id: "notice1",
            status: "read",
            occurred_at: "2026-09-05T01:00:00Z",
          },
          {
            notification_id: "notice2",
            status: "dismissed",
            occurred_at: "2026-09-05T02:00:00Z",
          },
        ],
        receipts: [
          {
            id: "receipt1",
            notification_id: "notice1",
            status: "read",
            occurred_at: "2026-09-05T01:00:00Z",
            created_at: "2026-09-05T01:00:00Z",
          },
        ],
      }}
      action={vi.fn()}
    />,
  );
  expect(screen.getByRole("heading", { name: "Scheduled maintenance" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Dismissed notice" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Notification history" })).toHaveTextContent("read");
  expect(screen.getByRole("region", { name: "Notification history" })).toHaveTextContent(
    "Scheduled maintenance",
  );
});

it("records a clicked receipt for safe notification links", async () => {
  const user = userEvent.setup();
  const action = vi.fn(async () => ({ status: "success" as const, message: "" }));
  const note = {
    ...notificationDocument.notifications[0]!,
    actions: [
      { label: "Details", url: "https://example.test/details", kind: "link", primary: true },
    ],
  };
  render(<AccountNotifications notifications={[note]} action={action} />);

  await user.click(screen.getByRole("link", { name: "Details" }));

  await waitFor(() => expect(action).toHaveBeenCalled());
  const data = action.mock.calls[0] as unknown as [unknown, FormData];
  expect(data[1].get("status")).toBe("clicked");
  expect(data[1].get("notificationId")).toBe(note.id);
});

it("queues email with selected recipients and renders current jobs", async () => {
  const user = userEvent.setup();
  const action = vi.fn(async () => ({
    status: "success" as const,
    message: "Email queued.",
  }));
  render(<AdminEmailManager queue={emailQueue} action={action} />);

  expect(screen.getByRole("cell", { name: /Maintenance window/u })).toBeInTheDocument();
  await user.type(screen.getByRole("textbox", { name: "Subject" }), "New notice");
  await user.type(screen.getByRole("textbox", { name: "Body" }), "A scheduled account email.");
  await user.selectOptions(screen.getByRole("combobox", { name: "Recipients" }), "selected");
  await user.type(screen.getByRole("textbox", { name: "Email addresses" }), "owner@example.test");
  await user.click(screen.getByRole("button", { name: "Queue email" }));

  await waitFor(() => expect(action).toHaveBeenCalled());
  const data = action.mock.calls[0] as unknown as [unknown, FormData];
  expect(data[1].get("revision")).toBe(emailQueue.revision);
  expect(JSON.parse(String(data[1].get("email")))).toMatchObject({
    subject: "New notice",
    body: "A scheduled account email.",
    target: { mode: "selected", emails: ["owner@example.test"], user_ids: [] },
  });
});

it("disables email queueing when the quota is full", () => {
  render(
    <AdminEmailManager
      queue={{
        ...emailQueue,
        quota: { daily_limit: 25, queued_24h: 25, queue_limit: 500 },
      }}
      action={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Queue email" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("quota");
});

it("renders email retry and dead-letter state", () => {
  render(
    <AdminEmailManager
      queue={{
        ...emailQueue,
        jobs: [
          {
            ...emailQueue.jobs[0]!,
            status: "retry",
            attempts: 1,
            next_attempt_at: "2026-09-05T04:05:00Z",
            last_error: "temporary failure",
          },
          {
            ...emailQueue.jobs[0]!,
            id: "31000000-0000-4000-8000-000000000002",
            status: "dead",
            attempts: 3,
            completed_at: "2026-09-05T04:00:00Z",
            next_attempt_at: "",
            last_error: "delivery failed",
          },
        ],
      }}
      action={vi.fn()}
    />,
  );

  expect(screen.getByRole("cell", { name: "Retrying" })).toBeInTheDocument();
  expect(screen.getAllByText(/5 Sep 2026, 04:05 UTC/).length).toBeGreaterThan(0);
  expect(screen.queryByText("2026-09-05T04:05:00Z")).not.toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "Failed" })).toBeInTheDocument();
  expect(screen.getAllByText("delivery failed")).toHaveLength(1);
});
