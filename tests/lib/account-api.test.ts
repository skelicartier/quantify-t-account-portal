import {
  AccountApiRequestError,
  AccountApiUnavailableError,
  type AccountApiAccountLifecycle,
  type AccountApiNotificationState,
  type AccountApiNotifications,
  type AccountApiMe,
  buildAccountApiUrl,
  cancelAccountApiAccountDeletion,
  fetchAccountApiAccountExportDownload,
  fetchAccountApiAccountLifecycle,
  fetchAccountApiNotificationState,
  fetchAccountApiNotifications,
  fetchAccountApiMe,
  postAccountApiJson,
  recordAccountApiNotificationReceipt,
  requestAccountApiAccountDeletion,
  requestAccountApiAccountExport,
  resolveAccountApiBaseUrl,
  approveAccountApiHandoff,
  denyAccountApiHandoff,
  fetchAccountApiHandoff,
} from "@/lib/admin/account-api";

const ACCOUNT_API_URL = "https://account-api.example.test/api/v1";
const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";

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
    "roles:read-report",
    "roles:write",
    "configuration:read",
    "credentials:read-status",
    "releases:read-status",
  ],
  environment: "staging",
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
