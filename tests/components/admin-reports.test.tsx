import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdminReportManager } from "@/components/admin/admin-report-manager";
import type { AccountApiAdminReports } from "@/lib/admin/account-api";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";

const reports: AccountApiAdminReports = {
  ok: true,
  correlation_id: "qt-reports",
  revision: "report-queue-revision-123456",
  generated_at: "2026-09-06T01:00:00Z",
  queue: { job_limit: 200, returned: 1 },
  jobs: [
    {
      id: "23000000-0000-4000-8000-000000000001",
      report_type: "audit-events",
      format: "csv",
      filters: { event_type: "session.revoked", subject_user_id: USER_ID },
      status: "ready",
      queued_at: "2026-09-06T01:00:00Z",
      generated_at: "2026-09-06T01:01:00Z",
      expires_at: "2026-09-07T01:00:00Z",
      attempts: 1,
      max_attempts: 3,
      next_attempt_at: "",
      last_error: "",
      row_count: 2,
      download: {
        available: true,
        private: true,
        source_locked: true,
        content_type: "text/csv; charset=utf-8",
        filename: "audit-events-23000000-0000-4000-8000-000000000001.csv",
        expires_at: "2026-09-06T01:15:00Z",
        ttl_seconds: 900,
        byte_count: 128,
        sha256: "a".repeat(64),
        url: null,
      },
    },
  ],
};

it("queues an audit CSV report and renders source-locked download state", async () => {
  const user = userEvent.setup();
  const action = vi.fn(async () => ({
    status: "success" as const,
    message: "Report queued.",
  }));
  render(<AdminReportManager reports={reports} action={action} />);

  expect(screen.getByRole("cell", { name: /Audit Events CSV/u })).toBeInTheDocument();
  expect(screen.getAllByRole("cell", { name: "Ready" })).toHaveLength(1);
  expect(screen.getByText("Private file ready")).toBeVisible();
  expect(screen.queryByText(/https?:\/\//u)).not.toBeInTheDocument();

  await user.type(screen.getByRole("textbox", { name: "Event" }), "session.revoked");
  await user.type(screen.getByRole("textbox", { name: "Subject" }), USER_ID);
  await user.click(screen.getByRole("button", { name: "Queue CSV" }));

  await waitFor(() => expect(action).toHaveBeenCalled());
  const data = action.mock.calls[0] as unknown as [unknown, FormData];
  expect(data[1].get("revision")).toBe(reports.revision);
  expect(data[1].get("event_type")).toBe("session.revoked");
  expect(data[1].get("subject_user_id")).toBe(USER_ID);
});

it("disables report queueing when the private queue is full", () => {
  render(
    <AdminReportManager
      reports={{
        ...reports,
        queue: { job_limit: 1, returned: 1 },
      }}
      action={vi.fn()}
    />,
  );

  expect(screen.getByRole("button", { name: "Queue CSV" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("limit");
});
