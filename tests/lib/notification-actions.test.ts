import { AccountApiRequestError } from "@/lib/admin/account-api";
import type { AssuranceState } from "@/lib/auth/assurance";
import { INITIAL_NOTIFICATION_STATE } from "@/lib/notifications/input";
import { notification, notificationDocument } from "../fixtures/notifications";

const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  fetchAccountApiMe: vi.fn(),
  enqueueAccountApiAdminReport: vi.fn(),
  fetchAccountApiAdminReports: vi.fn(),
  enqueueAccountApiAdminNotificationEmail: vi.fn(),
  fetchAccountApiAdminNotificationEmailQueue: vi.fn(),
  fetchAccountApiAdminNotifications: vi.fn(),
  updateAccountApiAdminNotifications: vi.fn(),
  getCurrentAssurance: vi.fn(),
  requireMutationAssurance: vi.fn(),
  recordAccountApiNotificationReceipt: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
}));
vi.mock("@/lib/dal/assurance-guard", () => ({
  getCurrentAssurance: mocks.getCurrentAssurance,
  requireMutationAssurance: mocks.requireMutationAssurance,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin/account-api", async () => ({
  ...(await vi.importActual<typeof import("@/lib/admin/account-api")>("@/lib/admin/account-api")),
  fetchAccountApiMe: mocks.fetchAccountApiMe,
  enqueueAccountApiAdminReport: mocks.enqueueAccountApiAdminReport,
  fetchAccountApiAdminReports: mocks.fetchAccountApiAdminReports,
  enqueueAccountApiAdminNotificationEmail: mocks.enqueueAccountApiAdminNotificationEmail,
  fetchAccountApiAdminNotificationEmailQueue: mocks.fetchAccountApiAdminNotificationEmailQueue,
  fetchAccountApiAdminNotifications: mocks.fetchAccountApiAdminNotifications,
  updateAccountApiAdminNotifications: mocks.updateAccountApiAdminNotifications,
  recordAccountApiNotificationReceipt: mocks.recordAccountApiNotificationReceipt,
}));
import { saveAdminNotification } from "@/app/admin/notifications/actions";
import { enqueueAdminEmail } from "@/app/admin/email/actions";
import { enqueueAdminReport } from "@/app/admin/reports/actions";
import { acknowledgeNotification } from "@/app/account/notifications/actions";

const INITIAL_ADMIN_REPORT_STATE = { status: "idle" as const, message: "" };

const satisfiedAssurance: AssuranceState = {
  verifiedTotpFactors: [],
  unverifiedTotpFactorIds: [],
  currentLevel: "aal2",
  requiredLevel: "aal2",
  mfaEnrolled: true,
  challengeRequired: false,
  levelReadable: true,
  factorsReadable: true,
};

function form(value: unknown = notification) {
  const data = new FormData();
  data.set("revision", notificationDocument.revision);
  data.set("notification", JSON.stringify(value));
  return data;
}

function emailForm(
  value: unknown = {
    subject: "Maintenance window",
    body: "A maintenance window is scheduled.",
    scheduled_at: "2026-09-06T01:00:00Z",
    target: { mode: "all", user_ids: [], emails: [] },
  },
) {
  const data = new FormData();
  data.set("revision", "email-queue-revision-123456");
  data.set("email", JSON.stringify(value));
  return data;
}

function reportForm(value: Record<string, string> = {}) {
  const data = new FormData();
  data.set("revision", "report-queue-revision-123456");
  for (const [key, fieldValue] of Object.entries(value)) {
    data.set(key, fieldValue);
  }
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createServerAzureClient.mockResolvedValue({
    getAccessToken: () => "server-token",
  });
  mocks.fetchAccountApiMe.mockResolvedValue({
    capabilities: ["account:read-any", "notifications:write"],
  });
  mocks.getCurrentAssurance.mockResolvedValue(satisfiedAssurance);
  mocks.requireMutationAssurance.mockResolvedValue({ decision: "satisfied" });
  mocks.fetchAccountApiAdminNotifications.mockResolvedValue(notificationDocument);
  mocks.updateAccountApiAdminNotifications.mockResolvedValue({ ok: true });
  mocks.fetchAccountApiAdminNotificationEmailQueue.mockResolvedValue({
    ok: true,
    correlation_id: "qt-email-queue",
    revision: "email-queue-revision-123456",
    generated_at: "2026-09-05T01:00:00Z",
    quota: { daily_limit: 25, queued_24h: 0, queue_limit: 500 },
    jobs: [],
  });
  mocks.enqueueAccountApiAdminNotificationEmail.mockResolvedValue({ ok: true });
  mocks.fetchAccountApiAdminReports.mockResolvedValue({
    ok: true,
    correlation_id: "qt-reports",
    revision: "report-queue-revision-123456",
    generated_at: "2026-09-06T01:00:00Z",
    queue: { job_limit: 200, returned: 0 },
    jobs: [],
  });
  mocks.enqueueAccountApiAdminReport.mockResolvedValue({ ok: true });
  mocks.recordAccountApiNotificationReceipt.mockResolvedValue({ ok: true });
});

it("edits only the selected notice, retaining created time and other records", async () => {
  const other = { ...notificationDocument.notifications[0]!, id: "notice2" };
  mocks.fetchAccountApiAdminNotifications.mockResolvedValue({
    ...notificationDocument,
    notifications: [...notificationDocument.notifications, other],
  });
  expect(
    (
      await saveAdminNotification(
        INITIAL_NOTIFICATION_STATE,
        form({ ...notification, active: false }),
      )
    ).status,
  ).toBe("success");
  expect(mocks.updateAccountApiAdminNotifications).toHaveBeenCalledWith(
    "server-token",
    {
      expected_revision: notificationDocument.revision,
      notifications: [{ ...notificationDocument.notifications[0], active: false }, other],
    },
    { idempotencyKey: expect.stringMatching(/^portal-/u) },
  );
});

it("creates a new server-generated identifier for a duplicate", async () => {
  await saveAdminNotification(
    INITIAL_NOTIFICATION_STATE,
    form({ ...notification, id: "", active: false }),
  );
  const body = mocks.updateAccountApiAdminNotifications.mock.calls[0]![1];
  expect(body.notifications).toHaveLength(2);
  expect(body.notifications[1].id).not.toBe(notification.id);
  expect(body.notifications[1].created_at).toEqual(expect.any(String));
});

it("sends the empty source revision when publishing the first notification", async () => {
  mocks.fetchAccountApiAdminNotifications.mockResolvedValue({
    ...notificationDocument,
    revision: "",
    notifications: [],
  });
  const data = form({ ...notification, id: "" });
  data.set("revision", "");
  await saveAdminNotification(INITIAL_NOTIFICATION_STATE, data);
  expect(mocks.updateAccountApiAdminNotifications.mock.calls[0]![1].expected_revision).toBe("");
});

it.each([
  { ...notification, body: "<script>alert(1)</script>" },
  {
    ...notification,
    actions: [{ label: "Open", url: "javascript:alert(1)", kind: "link", primary: false }],
  },
  { ...notification, target: { mode: "selected", user_ids: [], emails: [] } },
  { ...notification, starts_at: "2026-10-01T00:00:00Z", expires_at: "2026-09-01T00:00:00Z" },
  { ...notification, role: "owner" },
])("rejects unsafe or invalid content before writing", async (value) => {
  expect((await saveAdminNotification(INITIAL_NOTIFICATION_STATE, form(value))).status).toBe(
    "error",
  );
  expect(mocks.updateAccountApiAdminNotifications).not.toHaveBeenCalled();
});

it.each(["capability", "mfa", "session", "stale", "missing-revision", "duplicate-field"])(
  "refuses the %s bypass",
  async (scenario) => {
    const data = form();
    if (scenario === "capability")
      mocks.fetchAccountApiMe.mockResolvedValue({ capabilities: ["account:read-any"] });
    if (scenario === "mfa")
      mocks.getCurrentAssurance.mockResolvedValue({
        ...satisfiedAssurance,
        currentLevel: "aal1",
        challengeRequired: true,
      });
    if (scenario === "session")
      mocks.createServerAzureClient.mockResolvedValue({
        getAccessToken: () => null,
      });
    if (scenario === "stale") data.set("revision", "old-revision");
    if (scenario === "missing-revision") data.delete("revision");
    if (scenario === "duplicate-field") data.append("notification", JSON.stringify(notification));
    expect((await saveAdminNotification(INITIAL_NOTIFICATION_STATE, data)).status).toBe("error");
    expect(mocks.updateAccountApiAdminNotifications).not.toHaveBeenCalled();
  },
);

it("maps a concurrent write to a reload response", async () => {
  mocks.updateAccountApiAdminNotifications.mockRejectedValue(
    new AccountApiRequestError({
      status: 409,
      code: "revision_conflict",
      message: "Conflict",
      correlationId: "qt-conflict",
    }),
  );
  expect((await saveAdminNotification(INITIAL_NOTIFICATION_STATE, form())).message).toMatch(
    /reload/i,
  );
});

it("maps an incompatible source document to a migration response", async () => {
  mocks.updateAccountApiAdminNotifications.mockRejectedValue(
    new AccountApiRequestError({
      status: 409,
      code: "notification_document_incompatible",
      message: "Conflict",
      correlationId: "qt-incompatible",
    }),
  );
  expect((await saveAdminNotification(INITIAL_NOTIFICATION_STATE, form())).message).toMatch(
    /migration/i,
  );
});

it("refuses an oversized aggregate document before sending it upstream", async () => {
  const rows = Array.from({ length: 200 }, (_, index) => ({
    ...notificationDocument.notifications[0]!,
    id: `notice${index}`,
    body: "\u20ac".repeat(4000),
  }));
  mocks.fetchAccountApiAdminNotifications.mockResolvedValue({
    ...notificationDocument,
    notifications: rows,
  });
  const result = await saveAdminNotification(INITIAL_NOTIFICATION_STATE, form(notification));
  expect(result.message).toMatch(/too large/i);
  expect(mocks.updateAccountApiAdminNotifications).not.toHaveBeenCalled();
});

it("queues admin email with the current revision and server idempotency key", async () => {
  const result = await enqueueAdminEmail(INITIAL_NOTIFICATION_STATE, emailForm());
  expect(result).toMatchObject({ status: "success", message: "Email queued." });
  expect(mocks.enqueueAccountApiAdminNotificationEmail).toHaveBeenCalledWith(
    "server-token",
    {
      expected_revision: "email-queue-revision-123456",
      subject: "Maintenance window",
      body: "A maintenance window is scheduled.",
      scheduled_at: "2026-09-06T01:00:00Z",
      target: { mode: "all", user_ids: [], emails: [] },
    },
    { idempotencyKey: expect.stringMatching(/^portal-/u) },
  );
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/email");
});

it("accepts a valid selected email payload above the old small action cap", async () => {
  const userIds = Array.from(
    { length: 5000 },
    (_, index) => `41000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
  const emails = Array.from(
    { length: 5000 },
    (_, index) => `recipient-${String(index).padStart(4, "0")}-account-notification@example.test`,
  );
  const value = {
    subject: "Maintenance window",
    body: "A maintenance window is scheduled.",
    scheduled_at: "",
    target: { mode: "selected", user_ids: userIds, emails },
  };
  const data = emailForm(value);
  expect(Buffer.byteLength(String(data.get("email")), "utf8")).toBeGreaterThan(300_000);

  expect((await enqueueAdminEmail(INITIAL_NOTIFICATION_STATE, data)).status).toBe("success");
  expect(mocks.enqueueAccountApiAdminNotificationEmail).toHaveBeenCalledWith(
    "server-token",
    { ...value, expected_revision: "email-queue-revision-123456" },
    { idempotencyKey: expect.stringMatching(/^portal-/u) },
  );
});

it.each([
  {
    subject: "Maintenance window",
    body: "http://bad.example.test",
    scheduled_at: "",
    target: { mode: "all", user_ids: [], emails: [] },
  },
  {
    subject: "Maintenance window",
    body: "<script>alert(1)</script>",
    scheduled_at: "",
    target: { mode: "all", user_ids: [], emails: [] },
  },
  {
    subject: "Maintenance window",
    body: "A maintenance window is scheduled.",
    scheduled_at: "",
    target: { mode: "selected", user_ids: [], emails: [] },
  },
])("rejects unsafe email queue payloads before writing", async (value) => {
  expect((await enqueueAdminEmail(INITIAL_NOTIFICATION_STATE, emailForm(value))).status).toBe(
    "error",
  );
  expect(mocks.enqueueAccountApiAdminNotificationEmail).not.toHaveBeenCalled();
});

it("refuses stale email queue revisions and maps quota errors", async () => {
  const stale = emailForm();
  stale.set("revision", "old-revision");
  expect((await enqueueAdminEmail(INITIAL_NOTIFICATION_STATE, stale)).message).toMatch(/changed/i);
  expect(mocks.enqueueAccountApiAdminNotificationEmail).not.toHaveBeenCalled();

  mocks.fetchAccountApiAdminNotificationEmailQueue.mockResolvedValue({
    ok: true,
    correlation_id: "qt-email-queue",
    revision: "email-queue-revision-123456",
    generated_at: "2026-09-05T01:00:00Z",
    quota: { daily_limit: 25, queued_24h: 0, queue_limit: 500 },
    jobs: [],
  });
  mocks.enqueueAccountApiAdminNotificationEmail.mockRejectedValue(
    new AccountApiRequestError({
      status: 429,
      code: "quota_exceeded",
      message: "Quota",
      correlationId: "qt-quota",
    }),
  );
  expect((await enqueueAdminEmail(INITIAL_NOTIFICATION_STATE, emailForm())).message).toMatch(
    /quota/i,
  );
});

it("queues an admin audit report with the current revision and server idempotency key", async () => {
  mocks.fetchAccountApiMe.mockResolvedValue({
    capabilities: ["account:read-any", "audit:read"],
  });
  const result = await enqueueAdminReport(
    INITIAL_ADMIN_REPORT_STATE,
    reportForm({
      event_type: "session.revoked",
      subject_user_id: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
    }),
  );

  expect(result).toMatchObject({ status: "success", message: "Report queued." });
  expect(mocks.enqueueAccountApiAdminReport).toHaveBeenCalledWith(
    "server-token",
    {
      expected_revision: "report-queue-revision-123456",
      report_type: "audit-events",
      format: "csv",
      filters: {
        event_type: "session.revoked",
        subject_user_id: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
      },
    },
    { idempotencyKey: expect.stringMatching(/^portal-/u) },
  );
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/reports");
});

it.each(["capability", "mfa", "stale", "duplicate-field", "quota"])(
  "refuses report queueing on %s",
  async (scenario) => {
    mocks.fetchAccountApiMe.mockResolvedValue({
      capabilities: ["account:read-any", "audit:read"],
    });
    const data = reportForm({ event_type: "session.revoked" });
    if (scenario === "capability") {
      mocks.fetchAccountApiMe.mockResolvedValue({ capabilities: ["account:read-any"] });
    }
    if (scenario === "mfa") {
      mocks.getCurrentAssurance.mockResolvedValue({
        ...satisfiedAssurance,
        currentLevel: "aal1",
        challengeRequired: true,
      });
    }
    if (scenario === "stale") data.set("revision", "old-revision");
    if (scenario === "duplicate-field") data.append("event_type", "account.viewed");
    if (scenario === "quota") {
      mocks.enqueueAccountApiAdminReport.mockRejectedValue(
        new AccountApiRequestError({
          status: 429,
          code: "quota_exceeded",
          message: "Quota",
          correlationId: "qt-quota",
        }),
      );
    }

    expect((await enqueueAdminReport(INITIAL_ADMIN_REPORT_STATE, data)).status).toBe("error");
    if (scenario !== "quota") {
      expect(mocks.enqueueAccountApiAdminReport).not.toHaveBeenCalled();
    }
  },
);

it("records receipts using only the current bearer identity", async () => {
  const data = new FormData();
  data.set("notificationId", "notice1");
  data.set("status", "read");
  expect((await acknowledgeNotification(INITIAL_NOTIFICATION_STATE, data)).status).toBe("success");
  expect(mocks.recordAccountApiNotificationReceipt).toHaveBeenCalledWith(
    "server-token",
    "notice1",
    "read",
    { idempotencyKey: expect.stringMatching(/^portal-/u) },
  );
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/account/notifications");
  mocks.requireMutationAssurance.mockResolvedValue({ decision: "challenge-required" });
  expect((await acknowledgeNotification(INITIAL_NOTIFICATION_STATE, data)).status).toBe("error");
  expect(mocks.recordAccountApiNotificationReceipt).toHaveBeenCalledTimes(1);
});
