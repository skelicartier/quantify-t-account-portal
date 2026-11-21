import {
  AccountApiRequestError,
  AccountApiUnavailableError,
  CREDENTIAL_STATUS_CAPABILITY,
  CONFIGURATION_CAPABILITY,
  type AccountApiAccountLifecycle,
  type AccountApiAdminAuditEvents,
  type AccountApiAdminReports,
  type AccountApiAdminConfiguration,
  type AccountApiAdminCredentialStatus,
  type AccountApiAdminNotificationEmailQueue,
  type AccountApiAdminNotifications,
  type AccountApiAdminReleaseStatus,
  type AccountApiNotificationState,
  type AccountApiNotifications,
  type AccountApiMe,
  type AccountApiAdminMetrics,
  type AccountApiAdminUserDetail,
  type AccountApiAdminUsers,
  type AccountApiRoleReport,
  buildAccountApiUrl,
  cancelAccountApiAccountDeletion,
  fetchAccountApiAccountExportDownload,
  fetchAccountApiAccountLifecycle,
  fetchAccountApiAdminAuditEvents,
  fetchAccountApiAdminReportDownload,
  fetchAccountApiAdminReports,
  fetchAccountApiAdminConfiguration,
  fetchAccountApiAdminCredentialStatus,
  fetchAccountApiAdminMetrics,
  fetchAccountApiAdminNotificationEmailQueue,
  fetchAccountApiAdminNotifications,
  fetchAccountApiAdminReleaseStatus,
  fetchAccountApiAdminUser,
  fetchAccountApiAdminUsers,
  fetchAccountApiNotificationState,
  fetchAccountApiNotifications,
  fetchAccountApiMe,
  fetchAccountApiRoleReport,
  postAccountApiJson,
  recordAccountApiNotificationReceipt,
  RELEASE_STATUS_CAPABILITY,
  requestAccountApiAccountDeletion,
  requestAccountApiAccountExport,
  revokeAccountApiAdminUserSession,
  resolveAccountApiBaseUrl,
  ROLE_REPORT_CAPABILITY,
  setAccountApiAdminUserActive,
  setAccountApiAdminUserRole,
  approveAccountApiHandoff,
  denyAccountApiHandoff,
  fetchAccountApiHandoff,
  enqueueAccountApiAdminNotificationEmail,
  enqueueAccountApiAdminReport,
  updateAccountApiAdminNotifications,
} from "@/lib/admin/account-api";

const ACCOUNT_API_URL = "https://account-api.example.test/api/v1";
const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";
const SESSION_ID = "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66";

type TestFetcher = (input: URL, init: RequestInit) => Promise<Response>;

const mePayload: AccountApiMe = {
  ok: true,
  correlation_id: "qt-correlation",
  user: {
    user_id: USER_ID,
    email: "owner@example.test",
    is_active: true,
  },
  role: {
    effective: "owner",
    database: "owner",
    legacy: "admin",
    mismatch: "expected-owner-projection",
    break_glass: false,
  },
  capabilities: [
    "account:read-self",
    "account:read-any",
    ROLE_REPORT_CAPABILITY,
    "roles:write",
    CONFIGURATION_CAPABILITY,
    CREDENTIAL_STATUS_CAPABILITY,
    RELEASE_STATUS_CAPABILITY,
  ],
  environment: "staging",
};

const roleReportPayload: AccountApiRoleReport = {
  ok: true,
  correlation_id: "qt-correlation",
  legacy_source_available: true,
  legacy_retirement_ready: true,
  legacy_blob_entry_count: 3,
  legacy_unparsable_entry_count: 0,
  legacy_entry_count: 4,
  legacy_bootstrap_count: 1,
  counts_by_mismatch: {
    match: 3,
    "expected-owner-projection": 1,
  },
  counts_by_role: {
    owner: 1,
    admin: 1,
    support: 1,
    user: 1,
  },
  total_users: 4,
  break_glass_disclosed: true,
  entries: [],
};

const metricsPayload: AccountApiAdminMetrics = {
  ok: true,
  correlation_id: "qt-metrics",
  generated_at: "2026-09-04T08:54:54Z",
  window: { hours: 24, since: "2026-09-03T08:54:54Z" },
  accounts: {
    total: 4,
    active: 3,
    inactive: 1,
    created_24h: 1,
    logged_in_24h: 2,
  },
  sessions: {
    total: 3,
    active: 1,
    expired: 1,
    revoked: 1,
    by_source: { portal: 2, desktop: 1 },
  },
  auth_events_24h: {
    total: 5,
    by_type: { "session.registered": 2, "session.revoked": 1 },
    by_outcome: { success: 4, blocked: 1 },
    by_source: { "account-api": 5 },
  },
  limits: {
    row_limit: 10000,
    accounts_truncated: false,
    sessions_truncated: false,
    events_truncated: false,
  },
};

const configurationPayload: AccountApiAdminConfiguration = {
  ok: true,
  correlation_id: "qt-configuration",
  generated_at: "2026-09-06T01:00:00Z",
  environment: "staging",
  cors: { allowed_origin_count: 2, wildcard_allowed: false },
  limits: {
    max_body_bytes: 16384,
    upstream_timeout_seconds: 8,
    idempotency_ttl_seconds: 86400,
    reservation_lease_seconds: 180,
    email_worker_batch_limit: 5,
    artifact_worker_batch_limit: 2,
    deletion_worker_batch_limit: 1,
    signed_download_ttl_seconds: 900,
  },
  features: {
    email_worker_enabled: false,
    artifact_worker_enabled: false,
    deletion_worker_enabled: false,
    signed_downloads_enabled: false,
    account_export_encryption_configured: false,
    private_artifact_storage_configured: true,
    legacy_role_source_configured: true,
    break_glass_owner_count: 1,
    legacy_bootstrap_admin_count: 1,
  },
};

const credentialStatusPayload: AccountApiAdminCredentialStatus = {
  ok: true,
  correlation_id: "qt-credentials",
  generated_at: "2026-09-06T01:00:00Z",
  credentials: [
    { name: "supabase_service_role", configured: true, secret: true, rotation: "source-locked" },
    { name: "brevo_sender_email", configured: true, secret: false, rotation: "source-locked" },
  ],
};

const releaseStatusPayload: AccountApiAdminReleaseStatus = {
  ok: true,
  correlation_id: "qt-releases",
  generated_at: "2026-09-06T01:00:00Z",
  release_management: {
    configured: false,
    publish_enabled: false,
    rollback_enabled: false,
    requires_https_url: true,
    requires_checksum: true,
    requires_server_signature: true,
    status: "source-locked",
  },
};

const auditEventsPayload: AccountApiAdminAuditEvents = {
  ok: true,
  correlation_id: "qt-audit",
  generated_at: "2026-09-04T08:54:54Z",
  pagination: { limit: 25, offset: 0, has_more: false, next_offset: null },
  filters: { event_type: "session.revoked" },
  events: [
    {
      id: "event-1",
      subject_user_id: USER_ID,
      actor_user_id: "960aac31-73fb-4e10-8f3f-bfcf22a71c12",
      session_id: SESSION_ID,
      event_type: "session.revoked",
      outcome: "success",
      source: "account-api",
      request_id: "qt-request-123456",
      occurred_at: "2026-09-04T01:00:00Z",
      created_at: "2026-09-04T01:00:00Z",
      summary: { actor_role: "admin" },
    },
  ],
};

const adminReportsPayload: AccountApiAdminReports = {
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

const accountLifecyclePayload: AccountApiAccountLifecycle = {
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
      sections: ["profile", "sessions", "activity"],
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
        sha256: "b".repeat(64),
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
      hold: null,
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
      offline_desktop_cache_note: "not-remotely-deletable",
    },
    requests: [],
  },
};

const notificationsPayload: AccountApiNotifications = {
  ok: true,
  correlation_id: "qt-notifications",
  revision: "notif-revision-123456",
  notifications: [
    {
      id: "notice1",
      title: "Service notice",
      body: "Maintenance tonight.",
      severity: "info",
      display: "popup",
      dismissible: true,
      active: true,
      created_at: "2026-09-04T00:00:00Z",
      starts_at: "2026-09-04T00:00:00Z",
      expires_at: "2099-09-04T00:00:00Z",
      actions: [
        { label: "Open", url: "https://account.example.test", kind: "link", primary: true },
      ],
    },
  ],
};

const notificationFixture = notificationsPayload.notifications[0]!;

const notificationStatePayload: AccountApiNotificationState = {
  ok: true,
  correlation_id: "qt-notification-state",
  state: [
    {
      notification_id: "notice1",
      status: "read",
      occurred_at: "2026-09-05T01:00:00Z",
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
};

const adminNotificationsPayload: AccountApiAdminNotifications = {
  ...notificationsPayload,
  notifications: [
    {
      ...notificationFixture,
      target: { mode: "selected", user_ids: [USER_ID], emails: ["owner@example.test"] },
    },
  ],
};

const adminEmailQueuePayload: AccountApiAdminNotificationEmailQueue = {
  ok: true,
  correlation_id: "qt-email-queue",
  revision: "email-queue-revision-123456",
  generated_at: "2026-09-05T01:00:00Z",
  quota: { daily_limit: 25, queued_24h: 1, queue_limit: 500 },
  jobs: [
    {
      id: "31000000-0000-4000-8000-000000000001",
      subject: "Maintenance window",
      body: "A maintenance window is scheduled.",
      target: { mode: "selected", user_ids: [USER_ID], emails: ["owner@example.test"] },
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

const adminUserSummary: AccountApiAdminUsers["users"][number] = {
  user: {
    user_id: USER_ID,
    email: "owner@example.test",
    first_name: "Owner",
    last_name: "One",
    display_name: "Owner One",
    is_active: true,
    subscription_tier: "pro",
    created_at: "2026-09-01T00:00:00Z",
    last_login_at: "2026-09-04T00:00:00Z",
    updated_at: "2026-09-04T00:00:00Z",
  },
  role: {
    effective: "owner",
    database: "owner",
    legacy: "admin",
    mismatch: "expected-owner-projection",
    break_glass: false,
  },
};

const adminUsersPayload: AccountApiAdminUsers = {
  ok: true,
  correlation_id: "qt-users",
  generated_at: "2026-09-04T08:54:54Z",
  pagination: { limit: 50, offset: 0, has_more: false, next_offset: null },
  users: [adminUserSummary],
};

const adminUserDetailPayload: AccountApiAdminUserDetail = {
  ...adminUserSummary,
  ok: true,
  correlation_id: "qt-user-detail",
  sessions: [
    {
      id: "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66",
      user_id: USER_ID,
      source: "desktop",
      provider: "supabase",
      client_instance_id: "client-123456",
      device_name: "MacBook",
      created_at: "2026-09-01T00:00:00Z",
      last_seen_at: "2026-09-04T00:00:00Z",
      expires_at: "2026-09-05T00:00:00Z",
      revoked_at: null,
      revoke_reason: null,
    },
  ],
  activity: [
    {
      id: "8e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66",
      user_id: USER_ID,
      session_id: "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66",
      event_type: "session.heartbeat",
      outcome: "success",
      source: "account-api",
      occurred_at: "2026-09-04T00:00:00Z",
      created_at: "2026-09-04T00:00:00Z",
    },
  ],
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function firstFetchCall(fetcher: ReturnType<typeof vi.fn<TestFetcher>>): [URL, RequestInit] {
  const call = fetcher.mock.calls[0];
  if (!call) throw new Error("Expected fetch to be called");
  return call;
}

describe("Account API client", () => {
  it("builds route URLs from the configured versioned base", () => {
    const base = resolveAccountApiBaseUrl({ QT_ACCOUNT_API_URL: `${ACCOUNT_API_URL}/` });

    expect(buildAccountApiUrl(base, "/me").toString()).toBe(`${ACCOUNT_API_URL}/me`);
  });

  it.each([
    ["https://account-api.example.test", "https://account-api.example.test/api/v1/me"],
    ["https://account-api.example.test/", "https://account-api.example.test/api/v1/me"],
    ["http://localhost:7071", "http://localhost:7071/api/v1/me"],
    ["http://127.0.0.1:7071/api/v1", "http://127.0.0.1:7071/api/v1/me"],
  ])("appends the versioned route prefix when the base %s omits it", (value, expected) => {
    const base = resolveAccountApiBaseUrl({ QT_ACCOUNT_API_URL: value });

    expect(buildAccountApiUrl(base, "me").toString()).toBe(expected);
  });

  it("logs a bounded breadcrumb and fails closed on a non-JSON response", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetcher = vi.fn<TestFetcher>(
      async () =>
        new Response("<html>404</html>", {
          status: 404,
          headers: { "content-type": "text/html", "x-correlation-id": "qt-platform-404" },
        }),
    );

    await expect(
      fetchAccountApiMe("bearer-token", {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
      }),
    ).rejects.toMatchObject({
      name: "AccountApiUnavailableError",
      correlationId: "qt-platform-404",
    });
    expect(consoleError).toHaveBeenCalledTimes(1);
    const line = String(consoleError.mock.calls[0]?.[0]);
    expect(line).toContain("[account-api] route=me method=GET outcome=non_json_response");
    expect(line).toContain("correlation_id=qt-platform-404");
    expect(line).not.toContain("bearer-token");
    consoleError.mockRestore();
  });

  it("logs schema issue paths without echoing the payload", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetcher = vi.fn<TestFetcher>(async () =>
      jsonResponse({ ...mePayload, environment: "", secret_field: "do-not-log" }),
    );

    await expect(
      fetchAccountApiMe("bearer-token", {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
      }),
    ).rejects.toBeInstanceOf(AccountApiUnavailableError);
    const line = String(consoleError.mock.calls[0]?.[0]);
    expect(line).toContain("outcome=schema_mismatch");
    expect(line).toContain("issues=environment");
    expect(line).toContain("correlation_id=qt-correlation");
    expect(line).not.toContain("do-not-log");
    consoleError.mockRestore();
  });

  it.each([
    "",
    "not-a-url",
    "http://account-api.example.test/api/v1",
    "https://user:pass@account-api.example.test/api/v1",
    "https://account-api.example.test/api/v1?token=secret",
  ])("rejects unsafe Account API base URL %s", (value) => {
    expect(() => resolveAccountApiBaseUrl({ QT_ACCOUNT_API_URL: value })).toThrow(
      AccountApiUnavailableError,
    );
  });

  it("calls /me with the server-side bearer token and no-store fetch", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(mePayload));

    const result = await fetchAccountApiMe(" bearer-token ", {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
    });

    expect(result.user.user_id).toBe(USER_ID);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = firstFetchCall(fetcher);
    expect(url.toString()).toBe(`${ACCOUNT_API_URL}/me`);
    expect(init.cache).toBe("no-store");
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      Authorization: "Bearer bearer-token",
    });
  });

  it("requests the role report without exposing matches by default", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(roleReportPayload));

    await fetchAccountApiRoleReport("bearer-token", {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
    });

    expect(firstFetchCall(fetcher)[0].toString()).toBe(`${ACCOUNT_API_URL}/admin/role-report`);
  });

  it("adds the reviewed include_matches query only when requested", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(roleReportPayload));

    await fetchAccountApiRoleReport("bearer-token", {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
      includeMatches: true,
    });

    expect(firstFetchCall(fetcher)[0].toString()).toBe(
      `${ACCOUNT_API_URL}/admin/role-report?include_matches=true`,
    );
  });

  it("fetches aggregate admin metrics with the server-side bearer token", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(metricsPayload));

    const result = await fetchAccountApiAdminMetrics(" bearer-token ", {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
    });

    expect(result.accounts.total).toBe(4);
    const [url, init] = firstFetchCall(fetcher);
    expect(url.toString()).toBe(`${ACCOUNT_API_URL}/admin/metrics`);
    expect(init.cache).toBe("no-store");
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      Authorization: "Bearer bearer-token",
    });
  });

  it("fetches owner-only platform status without secret values in routes", async () => {
    const fetcher = vi
      .fn<TestFetcher>()
      .mockResolvedValueOnce(jsonResponse(configurationPayload))
      .mockResolvedValueOnce(jsonResponse(credentialStatusPayload))
      .mockResolvedValueOnce(jsonResponse(releaseStatusPayload));

    const configuration = await fetchAccountApiAdminConfiguration("bearer-token", {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
    });
    const credentials = await fetchAccountApiAdminCredentialStatus("bearer-token", {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
    });
    const releases = await fetchAccountApiAdminReleaseStatus("bearer-token", {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
    });

    expect(configuration.features.break_glass_owner_count).toBe(1);
    expect(configuration.features.private_artifact_storage_configured).toBe(true);
    expect(credentials.credentials[0]?.rotation).toBe("source-locked");
    expect(releases.release_management.requires_server_signature).toBe(true);
    expect(fetcher.mock.calls.map((call) => call[0].toString())).toEqual([
      `${ACCOUNT_API_URL}/admin/configuration`,
      `${ACCOUNT_API_URL}/admin/credentials`,
      `${ACCOUNT_API_URL}/admin/releases`,
    ]);
    for (const [url] of fetcher.mock.calls) {
      expect(url.toString()).not.toMatch(/token|password|secret|key=/iu);
    }
  });

  it("fetches paginated admin users with the server-side bearer token", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(adminUsersPayload));

    const result = await fetchAccountApiAdminUsers(" bearer-token ", {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
      limit: 25,
      offset: 50,
    });

    expect(result.users[0]?.user.email).toBe("owner@example.test");
    const [url, init] = firstFetchCall(fetcher);
    expect(url.toString()).toBe(`${ACCOUNT_API_URL}/admin/users?limit=25&offset=50`);
    expect(init.cache).toBe("no-store");
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      Authorization: "Bearer bearer-token",
    });
  });

  it("fetches one admin user detail without putting secrets in the route", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(adminUserDetailPayload));

    const result = await fetchAccountApiAdminUser("bearer-token", USER_ID, {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
    });

    expect(result.sessions[0]?.source).toBe("desktop");
    const [url] = firstFetchCall(fetcher);
    expect(url.toString()).toBe(`${ACCOUNT_API_URL}/admin/users/${USER_ID}`);
    expect(url.toString()).not.toMatch(/token|password|passcode|pin/iu);
  });

  it("fetches filtered admin audit events without putting secrets in the route", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(auditEventsPayload));

    const result = await fetchAccountApiAdminAuditEvents("bearer-token", {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
      filters: { event_type: "session.revoked", subject_user_id: USER_ID },
      limit: 25,
      offset: 50,
    });

    expect(result.events[0]?.event_type).toBe("session.revoked");
    const [url, init] = firstFetchCall(fetcher);
    expect(url.toString()).toContain(`${ACCOUNT_API_URL}/admin/audit-events/search?`);
    expect(url.searchParams.get("event_type")).toBe("session.revoked");
    expect(url.searchParams.get("subject_user_id")).toBe(USER_ID);
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("offset")).toBe("50");
    expect(init.method).toBe("GET");
    expect(url.toString()).not.toMatch(/token|password|passcode|pin/iu);
  });

  it("fetches, queues, and checks private report downloads", async () => {
    const enqueuePayload = {
      ok: true,
      correlation_id: "qt-report-enqueue",
      revision: "report-queue-revision-654321",
      job: adminReportsPayload.jobs[0]!,
      event: { id: "event-1", event_type: "reports.queued" },
      replayed: false,
      legacy_mirrored: true,
    };
    const downloadPayload = {
      ok: true,
      correlation_id: "qt-report-download",
      generated_at: "2026-09-06T01:02:00Z",
      job: {
        ...adminReportsPayload.jobs[0]!,
        download: {
          ...adminReportsPayload.jobs[0]!.download,
          source_locked: false,
          url: "https://downloads.example.test/report.csv?sig=fake",
        },
      },
      event: { id: "event-2", event_type: "reports.download_requested" },
      legacy_mirrored: true,
    };
    const fetcher = vi
      .fn<TestFetcher>()
      .mockResolvedValueOnce(jsonResponse(adminReportsPayload))
      .mockResolvedValueOnce(jsonResponse(enqueuePayload))
      .mockResolvedValueOnce(jsonResponse(downloadPayload));

    const listed = await fetchAccountApiAdminReports("bearer-token", {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
    });
    const queued = await enqueueAccountApiAdminReport(
      "bearer-token",
      {
        expected_revision: listed.revision,
        report_type: "audit-events",
        format: "csv",
        filters: { event_type: "session.revoked", subject_user_id: USER_ID },
      },
      {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
        idempotencyKey: "report-queue-abcdef123456",
      },
    );
    const download = await fetchAccountApiAdminReportDownload("bearer-token", listed.jobs[0]!.id, {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
    });

    expect(listed.jobs[0]?.download.url).toBeNull();
    expect(queued.event?.event_type).toBe("reports.queued");
    expect(download.event?.event_type).toBe("reports.download_requested");
    expect(download.job.download.url).toBe("https://downloads.example.test/report.csv?sig=fake");
    expect(download.job.download.source_locked).toBe(false);
    expect(fetcher.mock.calls[0]?.[0].toString()).toBe(`${ACCOUNT_API_URL}/admin/reports`);
    const [enqueueUrl, enqueueInit] = fetcher.mock.calls[1] as [URL, RequestInit];
    expect(enqueueUrl.toString()).toBe(`${ACCOUNT_API_URL}/admin/reports/enqueue`);
    expect(enqueueInit.body).toBe(
      JSON.stringify({
        report_type: "audit-events",
        format: "csv",
        filters: { event_type: "session.revoked", subject_user_id: USER_ID },
        expected_revision: "report-queue-revision-123456",
      }),
    );
    expect(enqueueInit.headers).toMatchObject({ "Idempotency-Key": "report-queue-abcdef123456" });
    expect(fetcher.mock.calls[2]?.[0].toString()).toBe(
      `${ACCOUNT_API_URL}/admin/reports/${listed.jobs[0]!.id}/download`,
    );
    for (const [url] of fetcher.mock.calls) {
      expect(url.toString()).not.toMatch(/token|password|secret|artifact|signed/iu);
    }
  });

  it("reads and mutates account lifecycle state with endpoint-only export downloads", async () => {
    const exportPayload = {
      ok: true,
      correlation_id: "qt-export",
      revision: "lifecycle-revision-next",
      export: { ...accountLifecyclePayload.exports[0]!, status: "queued", generated_at: "" },
      event: { id: "event-export", event_type: "account.export_requested" },
      replayed: false,
      legacy_mirrored: true,
    };
    const downloadPayload = {
      ok: true,
      correlation_id: "qt-export-download",
      generated_at: "2026-09-06T01:02:00Z",
      export: {
        ...accountLifecyclePayload.exports[0]!,
        download: {
          ...accountLifecyclePayload.exports[0]!.download,
          source_locked: false,
          url: "https://downloads.example.test/export.json?sig=fake",
        },
      },
      event: { id: "event-download", event_type: "account.export_download_requested" },
      legacy_mirrored: true,
    };
    const deletionPayload = {
      ok: true,
      correlation_id: "qt-delete",
      revision: "lifecycle-revision-delete",
      deletion: accountLifecyclePayload.deletion.active!,
      event: { id: "event-delete", event_type: "account.deletion_requested" },
      replayed: false,
      legacy_mirrored: true,
    };
    const cancelPayload = {
      ...deletionPayload,
      correlation_id: "qt-delete-cancel",
      revision: "lifecycle-revision-cancel",
      deletion: {
        ...accountLifecyclePayload.deletion.active!,
        status: "cancelled",
        can_cancel: false,
      },
      event: { id: "event-cancel", event_type: "account.deletion_cancelled" },
    };
    const fetcher = vi
      .fn<TestFetcher>()
      .mockResolvedValueOnce(jsonResponse(accountLifecyclePayload))
      .mockResolvedValueOnce(jsonResponse(exportPayload))
      .mockResolvedValueOnce(jsonResponse(downloadPayload))
      .mockResolvedValueOnce(jsonResponse(deletionPayload))
      .mockResolvedValueOnce(jsonResponse(cancelPayload));

    const lifecycle = await fetchAccountApiAccountLifecycle("bearer-token", {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
    });
    const exportResult = await requestAccountApiAccountExport(
      "bearer-token",
      {
        expected_revision: lifecycle.revision,
        format: "json",
        confirmation: "EXPORT MY DATA",
      },
      {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
        idempotencyKey: "export-idempotency-key",
      },
    );
    const download = await fetchAccountApiAccountExportDownload(
      "bearer-token",
      lifecycle.exports[0]!.id,
      { environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL }, fetcher },
    );
    const deletion = await requestAccountApiAccountDeletion(
      "bearer-token",
      {
        expected_revision: lifecycle.revision,
        confirmation: "DELETE MY ACCOUNT",
      },
      {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
        idempotencyKey: "delete-idempotency-key",
      },
    );
    const cancellation = await cancelAccountApiAccountDeletion(
      "bearer-token",
      {
        expected_revision: deletion.revision,
        request_id: lifecycle.deletion.active!.id,
        confirmation: "KEEP MY ACCOUNT",
      },
      {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
        idempotencyKey: "cancel-idempotency-key",
      },
    );

    expect(lifecycle.exports[0]?.download.url).toBeNull();
    expect(exportResult.event?.event_type).toBe("account.export_requested");
    expect(download.event?.event_type).toBe("account.export_download_requested");
    expect(download.export.download.url).toBe(
      "https://downloads.example.test/export.json?sig=fake",
    );
    expect(download.export.download.source_locked).toBe(false);
    expect(deletion.event?.event_type).toBe("account.deletion_requested");
    expect(cancellation.event?.event_type).toBe("account.deletion_cancelled");
    expect(fetcher.mock.calls[0]?.[0].toString()).toBe(`${ACCOUNT_API_URL}/account/lifecycle`);
    expect(fetcher.mock.calls[1]?.[0].toString()).toBe(
      `${ACCOUNT_API_URL}/account/exports/request`,
    );
    expect(fetcher.mock.calls[2]?.[0].toString()).toBe(
      `${ACCOUNT_API_URL}/account/exports/${lifecycle.exports[0]!.id}/download`,
    );
    expect(fetcher.mock.calls[3]?.[0].toString()).toBe(
      `${ACCOUNT_API_URL}/account/deletion/request`,
    );
    expect(fetcher.mock.calls[4]?.[0].toString()).toBe(
      `${ACCOUNT_API_URL}/account/deletion/cancel`,
    );
    for (const [url, init] of fetcher.mock.calls) {
      expect(url.toString()).not.toMatch(/password|secret|artifact|signed/iu);
      expect(String(init.body ?? "")).not.toMatch(/current-password|bearer-token/iu);
    }
  });

  it("fetches visible notifications without target selectors", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(notificationsPayload));

    const result = await fetchAccountApiNotifications("bearer-token", {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
    });

    expect(result.notifications[0]?.id).toBe("notice1");
    expect(JSON.stringify(result)).not.toContain("target");
    const [url, init] = firstFetchCall(fetcher);
    expect(url.toString()).toBe(`${ACCOUNT_API_URL}/notifications`);
    expect(init.method).toBe("GET");
  });

  it("fetches notification state without raw audit metadata", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(notificationStatePayload));

    const result = await fetchAccountApiNotificationState("bearer-token", {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
    });

    expect(result.state[0]?.status).toBe("read");
    expect(JSON.stringify(result)).not.toContain("metadata");
    const [url, init] = firstFetchCall(fetcher);
    expect(url.toString()).toBe(`${ACCOUNT_API_URL}/notifications/state`);
    expect(init.method).toBe("GET");
  });

  it("records notification receipts with a server-generated idempotency key", async () => {
    const receiptPayload = {
      ok: true,
      correlation_id: "qt-notification-receipt",
      receipt: { notification_id: "notice1", status: "read" },
      event: { id: "event-1", event_type: "notification.receipt" },
      replayed: false,
    };
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(receiptPayload));

    const result = await recordAccountApiNotificationReceipt("bearer-token", "notice1", "read", {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
      idempotencyKey: "receipt-abcdef123456",
    });

    expect(result.event.event_type).toBe("notification.receipt");
    const [url, init] = firstFetchCall(fetcher);
    expect(url.toString()).toBe(`${ACCOUNT_API_URL}/notifications/receipts`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ notification_id: "notice1", status: "read" }));
    expect(init.headers).toMatchObject({ "Idempotency-Key": "receipt-abcdef123456" });
  });

  it("fetches and updates admin notifications through the versioned routes", async () => {
    const fetcher = vi
      .fn<TestFetcher>()
      .mockResolvedValueOnce(jsonResponse(adminNotificationsPayload))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          correlation_id: "qt-notifications-update",
          revision: "notif-revision-654321",
          count: 1,
          event: { id: "event-1", event_type: "notification.updated" },
          replayed: false,
          legacy_mirrored: true,
        }),
      );

    const listed = await fetchAccountApiAdminNotifications("bearer-token", {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
    });
    const updated = await updateAccountApiAdminNotifications(
      "bearer-token",
      { notifications: listed.notifications, expected_revision: listed.revision },
      {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
        idempotencyKey: "notifications-abcdef123456",
      },
    );

    expect(listed.notifications[0]?.target.emails).toEqual(["owner@example.test"]);
    expect(updated.event?.event_type).toBe("notification.updated");
    expect(fetcher.mock.calls[0]?.[0].toString()).toBe(`${ACCOUNT_API_URL}/admin/notifications`);
    const [updateUrl, updateInit] = fetcher.mock.calls[1] as [URL, RequestInit];
    expect(updateUrl.toString()).toBe(`${ACCOUNT_API_URL}/admin/notifications/update`);
    expect(updateInit.body).toBe(
      JSON.stringify({
        notifications: listed.notifications,
        expected_revision: "notif-revision-123456",
      }),
    );
    expect(updateInit.headers).toMatchObject({ "Idempotency-Key": "notifications-abcdef123456" });
  });

  it("fetches and enqueues admin email through the versioned routes", async () => {
    const fetcher = vi
      .fn<TestFetcher>()
      .mockResolvedValueOnce(jsonResponse(adminEmailQueuePayload))
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          correlation_id: "qt-email-enqueue",
          revision: "email-queue-revision-654321",
          job: adminEmailQueuePayload.jobs[0],
          event: { id: "event-1", event_type: "notification.email_queued" },
          replayed: false,
          legacy_mirrored: true,
        }),
      );

    const listed = await fetchAccountApiAdminNotificationEmailQueue("bearer-token", {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
    });
    const queued = await enqueueAccountApiAdminNotificationEmail(
      "bearer-token",
      {
        expected_revision: listed.revision,
        subject: "Maintenance window",
        body: "A maintenance window is scheduled.",
        scheduled_at: "2026-09-06T01:00:00Z",
        target: listed.jobs[0]!.target,
      },
      {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
        idempotencyKey: "email-queue-abcdef123456",
      },
    );

    expect(listed.jobs[0]?.target.emails).toEqual(["owner@example.test"]);
    expect(queued.event?.event_type).toBe("notification.email_queued");
    expect(fetcher.mock.calls[0]?.[0].toString()).toBe(`${ACCOUNT_API_URL}/admin/email`);
    const [enqueueUrl, enqueueInit] = fetcher.mock.calls[1] as [URL, RequestInit];
    expect(enqueueUrl.toString()).toBe(`${ACCOUNT_API_URL}/admin/email/enqueue`);
    expect(enqueueInit.body).toBe(
      JSON.stringify({
        subject: "Maintenance window",
        body: "A maintenance window is scheduled.",
        target: listed.jobs[0]!.target,
        scheduled_at: "2026-09-06T01:00:00Z",
        expected_revision: "email-queue-revision-123456",
      }),
    );
    expect(enqueueInit.headers).toMatchObject({ "Idempotency-Key": "email-queue-abcdef123456" });
  });

  it("sets admin user activation with a server-generated idempotency key", async () => {
    const activationPayload = {
      ...adminUserSummary,
      ok: true,
      correlation_id: "qt-activation",
      event: { id: "event-1", event_type: "account.deactivated" },
      replayed: false,
      legacy_mirrored: true,
    };
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(activationPayload));

    const result = await setAccountApiAdminUserActive("bearer-token", USER_ID, false, {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
      idempotencyKey: "portal-abcdef123456",
    });

    expect(result.event.event_type).toBe("account.deactivated");
    const [url, init] = firstFetchCall(fetcher);
    expect(url.toString()).toBe(`${ACCOUNT_API_URL}/admin/users/${USER_ID}/activation`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ is_active: false }));
    expect(init.headers).toMatchObject({
      Authorization: "Bearer bearer-token",
      "Idempotency-Key": "portal-abcdef123456",
    });
  });

  it("assigns an admin user role with a server-generated idempotency key", async () => {
    const rolePayload = {
      ...adminUserSummary,
      role: { ...adminUserSummary.role, effective: "admin", database: "admin" },
      ok: true,
      correlation_id: "qt-role",
      event: { id: "event-2", event_type: "account.role_changed" },
      replayed: false,
      legacy_mirrored: true,
    };
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(rolePayload));

    const result = await setAccountApiAdminUserRole("bearer-token", USER_ID, "admin", {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
      idempotencyKey: "portal-abcdef123456",
    });

    expect(result.role.effective).toBe("admin");
    expect(result.event.event_type).toBe("account.role_changed");
    const [url, init] = firstFetchCall(fetcher);
    expect(url.toString()).toBe(`${ACCOUNT_API_URL}/admin/users/${USER_ID}/role`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ role: "admin" }));
    expect(init.headers).toMatchObject({
      Authorization: "Bearer bearer-token",
      "Idempotency-Key": "portal-abcdef123456",
    });
  });

  it("refuses to send an unknown role or user id to the role route", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse({}));

    await expect(
      setAccountApiAdminUserRole("bearer-token", USER_ID, "superuser" as never, {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
        idempotencyKey: "portal-abcdef123456",
      }),
    ).rejects.toBeInstanceOf(AccountApiUnavailableError);
    await expect(
      setAccountApiAdminUserRole("bearer-token", "not-a-uuid", "admin", {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
        idempotencyKey: "portal-abcdef123456",
      }),
    ).rejects.toBeInstanceOf(AccountApiUnavailableError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("revokes an admin user session with a server-generated idempotency key", async () => {
    const revokePayload = {
      ok: true,
      correlation_id: "qt-session-revoke",
      session: {
        id: SESSION_ID,
        user_id: USER_ID,
        source: "portal",
        provider: "supabase",
        client_instance_id: "client-123456",
        device_name: "Safari",
        created_at: "2026-09-01T00:00:00Z",
        last_seen_at: "2026-09-04T00:00:00Z",
        expires_at: "2099-09-05T00:00:00Z",
        revoked_at: "2026-09-04T01:00:00Z",
        revoke_reason: "admin-revoked",
      },
      event: { id: "event-1", event_type: "session.revoked", outcome: "success" },
      replayed: false,
      legacy_mirrored: true,
    };
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(revokePayload));

    const result = await revokeAccountApiAdminUserSession("bearer-token", USER_ID, SESSION_ID, {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
      idempotencyKey: "portal-abcdef123456",
    });

    expect(result.session.revoked_at).toBe("2026-09-04T01:00:00Z");
    const [url, init] = firstFetchCall(fetcher);
    expect(url.toString()).toBe(
      `${ACCOUNT_API_URL}/admin/users/${USER_ID}/sessions/${SESSION_ID}/revoke`,
    );
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ reason: "admin-revoked" }));
    expect(init.headers).toMatchObject({
      Authorization: "Bearer bearer-token",
      "Idempotency-Key": "portal-abcdef123456",
    });
    expect(url.toString()).not.toMatch(/token|password|passcode|pin/iu);
  });

  const HANDOFF = "c2VjcmV0LWhhbmRvZmYtaWQtZnJvbS10aGUtYXBw";
  const handoffAnswer = {
    ok: true,
    correlation_id: "qt-handoff",
    status: "pending",
    user_code: "K7X4-P2M9",
    device_name: "Aaryan's MacBook Pro",
    client: "desktop",
    intent: "login",
    created_at: "2026-09-12T00:00:00Z",
    expires_at: "2026-09-12T00:10:00Z",
    approved_at: null,
  };

  it("reads a pending desktop handoff by its id", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(handoffAnswer));

    const result = await fetchAccountApiHandoff("bearer-token", HANDOFF, {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
    });

    expect(result.status).toBe("pending");
    expect(result.user_code).toBe("K7X4-P2M9");
    const [url, init] = firstFetchCall(fetcher);
    expect(url.toString()).toBe(`${ACCOUNT_API_URL}/auth/handoff/${HANDOFF}`);
    expect(init.method ?? "GET").toBe("GET");
    expect(init.headers).toMatchObject({ Authorization: "Bearer bearer-token" });
  });

  it("approves and denies a handoff through their own routes", async () => {
    const fetcher = vi.fn<TestFetcher>(async () =>
      jsonResponse({ ...handoffAnswer, status: "approved", approved_at: "2026-09-12T00:00:30Z" }),
    );

    const approved = await approveAccountApiHandoff("bearer-token", HANDOFF, {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher,
      idempotencyKey: "portal-handoff-1",
    });
    expect(approved.status).toBe("approved");
    const [url, init] = firstFetchCall(fetcher);
    expect(url.toString()).toBe(`${ACCOUNT_API_URL}/auth/handoff/${HANDOFF}/approve`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer bearer-token",
      "Idempotency-Key": "portal-handoff-1",
    });

    const denier = vi.fn<TestFetcher>(async () =>
      jsonResponse({ ...handoffAnswer, status: "denied" }),
    );
    const denied = await denyAccountApiHandoff("bearer-token", HANDOFF, {
      environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
      fetcher: denier,
      idempotencyKey: "portal-handoff-2",
    });
    expect(denied.status).toBe("denied");
    expect(firstFetchCall(denier)[0].toString()).toBe(
      `${ACCOUNT_API_URL}/auth/handoff/${HANDOFF}/deny`,
    );
  });

  it("fails closed on a malformed handoff id or an answer with a secret in it", async () => {
    const fetcher = vi.fn<TestFetcher>(async () =>
      jsonResponse({ ...handoffAnswer, challenge: "c".repeat(43) }),
    );

    await expect(
      fetchAccountApiHandoff("bearer-token", "short", {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
      }),
    ).rejects.toBeInstanceOf(AccountApiUnavailableError);
    expect(fetcher).not.toHaveBeenCalled();

    await expect(
      fetchAccountApiHandoff("bearer-token", HANDOFF, {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
      }),
    ).rejects.toBeInstanceOf(AccountApiUnavailableError);
  });

  it("posts JSON with a generated idempotency key supplied by server code", async () => {
    const fetcher = vi.fn<TestFetcher>(async () =>
      jsonResponse({ ok: true, correlation_id: "qt-session" }),
    );

    await postAccountApiJson(
      "sessions/register",
      "bearer-token",
      { source: "portal", device_name: "Web portal" },
      {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
        idempotencyKey: "portal-abcdef123456",
      },
    );

    const [url, init] = firstFetchCall(fetcher);
    expect(url.toString()).toBe(`${ACCOUNT_API_URL}/sessions/register`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ source: "portal", device_name: "Web portal" }));
    expect(init.headers).toMatchObject({
      Accept: "application/json",
      Authorization: "Bearer bearer-token",
      "Content-Type": "application/json",
      "Idempotency-Key": "portal-abcdef123456",
    });
  });

  it("maps typed API failures without leaking provider details", async () => {
    const fetcher = vi.fn<TestFetcher>(async () =>
      jsonResponse(
        {
          ok: false,
          correlation_id: "qt-error",
          error: { code: "forbidden", message: "This account is not permitted." },
        },
        403,
      ),
    );

    await expect(
      fetchAccountApiMe("bearer-token", {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
      correlationId: "qt-error",
    } satisfies Partial<AccountApiRequestError>);
  });

  it("maps fetch failures to the generic administration outage", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => {
      throw new TypeError("connection reset with internal details");
    });

    await expect(
      fetchAccountApiMe("bearer-token", {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
      }),
    ).rejects.toThrow(AccountApiUnavailableError);
  });

  it("fails closed for malformed success payloads", async () => {
    const fetcher = vi.fn<TestFetcher>(async () =>
      jsonResponse({ ok: true, user: { user_id: USER_ID } }),
    );

    await expect(
      fetchAccountApiMe("bearer-token", {
        environment: { QT_ACCOUNT_API_URL: ACCOUNT_API_URL },
        fetcher,
      }),
    ).rejects.toThrow(AccountApiUnavailableError);
  });
});
