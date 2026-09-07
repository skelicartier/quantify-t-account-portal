import {
  AccountApiRequestError,
  type AccountApiAdminAuditEvents,
  type AccountApiAdminConfiguration,
  type AccountApiAdminCredentialStatus,
  type AccountApiAdminMetrics,
  type AccountApiAdminNotificationEmailQueue,
  type AccountApiAdminNotifications,
  type AccountApiAdminReports,
  type AccountApiAdminReleaseStatus,
  type AccountApiAdminUserDetail,
  type AccountApiAdminUsers,
  type AccountApiMe,
  type AccountApiRoleReport,
} from "@/lib/admin/account-api";
import type { AssuranceState } from "@/lib/auth/assurance";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";

const me: AccountApiMe = {
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

const assurance: AssuranceState = {
  verifiedTotpFactors: [],
  unverifiedTotpFactorIds: [],
  currentLevel: "aal2",
  requiredLevel: "aal2",
  mfaEnrolled: true,
  challengeRequired: false,
  levelReadable: true,
  factorsReadable: true,
};

const roleReport: AccountApiRoleReport = {
  ok: true,
  correlation_id: "qt-role-report",
  legacy_source_available: true,
  legacy_retirement_ready: false,
  legacy_blob_entry_count: 3,
  legacy_unparsable_entry_count: 0,
  legacy_entry_count: 4,
  legacy_bootstrap_count: 1,
  counts_by_mismatch: { match: 3, "missing-in-database": 1 },
  counts_by_role: { owner: 1, admin: 1, support: 1, user: 1 },
  total_users: 4,
  break_glass_disclosed: false,
  entries: [],
};

const metrics: AccountApiAdminMetrics = {
  ok: true,
  correlation_id: "qt-metrics",
  generated_at: "2026-09-04T08:54:54Z",
  window: { hours: 24, since: "2026-09-03T08:54:54Z" },
  accounts: { total: 4, active: 3, inactive: 1, created_24h: 1, logged_in_24h: 2 },
  sessions: {
    total: 3,
    active: 1,
    expired: 1,
    revoked: 1,
    by_source: { portal: 2, desktop: 1 },
  },
  auth_events_24h: {
    total: 5,
    by_type: { "session.registered": 2 },
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

const configuration: AccountApiAdminConfiguration = {
  ok: true,
  correlation_id: "qt-configuration",
  generated_at: "2026-09-06T01:00:00Z",
  environment: "staging",
  cors: { allowed_origin_count: 1, wildcard_allowed: false },
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
    break_glass_owner_count: 0,
    legacy_bootstrap_admin_count: 1,
  },
};

const credentialStatus: AccountApiAdminCredentialStatus = {
  ok: true,
  correlation_id: "qt-credentials",
  generated_at: "2026-09-06T01:00:00Z",
  credentials: [
    { name: "supabase_service_role", configured: true, secret: true, rotation: "source-locked" },
  ],
};

const releaseStatus: AccountApiAdminReleaseStatus = {
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

const auditEvents: AccountApiAdminAuditEvents = {
  ok: true,
  correlation_id: "qt-audit",
  generated_at: "2026-09-04T08:54:54Z",
  pagination: { limit: 25, offset: 0, has_more: false, next_offset: null },
  filters: { event_type: "session.revoked" },
  events: [
    {
      id: "event-1",
      subject_user_id: USER_ID,
      actor_user_id: null,
      session_id: null,
      event_type: "session.revoked",
      outcome: "success",
      source: "account-api",
      request_id: null,
      occurred_at: "2026-09-04T01:00:00Z",
      created_at: "2026-09-04T01:00:00Z",
      summary: { actor_role: "redacted" },
    },
  ],
};

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
      filters: { event_type: "session.revoked" },
      status: "queued",
      queued_at: "2026-09-06T01:00:00Z",
      generated_at: "",
      expires_at: "2026-09-07T01:00:00Z",
      attempts: 0,
      max_attempts: 3,
      next_attempt_at: "2026-09-06T01:00:00Z",
      last_error: "",
      row_count: 0,
      download: {
        available: false,
        private: true,
        source_locked: true,
        content_type: "text/csv; charset=utf-8",
        filename: "audit-events-23000000-0000-4000-8000-000000000001.csv",
        expires_at: "2026-09-07T01:00:00Z",
        ttl_seconds: 900,
        byte_count: 0,
        sha256: "",
        url: null,
      },
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
  role: me.role,
};

const users: AccountApiAdminUsers = {
  ok: true,
  correlation_id: "qt-users",
  generated_at: "2026-09-04T08:54:54Z",
  pagination: { limit: 50, offset: 0, has_more: false, next_offset: null },
  users: [adminUserSummary],
};

const userDetail: AccountApiAdminUserDetail = {
  ...adminUserSummary,
  ok: true,
  correlation_id: "qt-user-detail",
  sessions: [],
  activity: [],
};

const notifications: AccountApiAdminNotifications = {
  ok: true,
  correlation_id: "qt-notifications",
  revision: "revision-123456",
  notifications: [],
};

const emailQueue: AccountApiAdminNotificationEmailQueue = {
  ok: true,
  correlation_id: "qt-email-queue",
  revision: "email-queue-revision-123456",
  generated_at: "2026-09-05T01:00:00Z",
  quota: { daily_limit: 25, queued_24h: 0, queue_limit: 500 },
  jobs: [],
};

type AccessHarnessOptions = {
  sessionToken?: string | null;
  mePayload?: AccountApiMe;
  assurancePayload?: AssuranceState;
  userDetailError?: Error;
};

async function loadAccessHarness(options: AccessHarnessOptions = {}) {
  vi.resetModules();

  const fetchAccountApiMe = vi.fn(async () => options.mePayload ?? me);
  const fetchAccountApiAdminAuditEvents = vi.fn(async () => auditEvents);
  const fetchAccountApiAdminReports = vi.fn(async () => reports);
  const fetchAccountApiAdminConfiguration = vi.fn(async () => configuration);
  const fetchAccountApiAdminCredentialStatus = vi.fn(async () => credentialStatus);
  const fetchAccountApiAdminMetrics = vi.fn(async () => metrics);
  const fetchAccountApiAdminReleaseStatus = vi.fn(async () => releaseStatus);
  const fetchAccountApiAdminNotificationEmailQueue = vi.fn(async () => emailQueue);
  const fetchAccountApiAdminNotifications = vi.fn(async () => notifications);
  const fetchAccountApiAdminUsers = vi.fn(async () => users);
  const fetchAccountApiAdminUser = vi.fn(async () => {
    if (options.userDetailError) throw options.userDetailError;
    return userDetail;
  });
  const fetchAccountApiRoleReport = vi.fn(async () => roleReport);
  const getCurrentAssurance = vi.fn(async () => options.assurancePayload ?? assurance);
  const redirect = vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  });
  const getSession = vi.fn(async () => ({
    data: {
      session:
        options.sessionToken === null
          ? null
          : { access_token: options.sessionToken ?? "bearer-token" },
    },
    error: null,
  }));
  const createServerSupabaseClient = vi.fn(async () => ({
    auth: { getSession },
  }));

  vi.doMock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));
  vi.doMock("@/lib/dal/assurance-guard", () => ({ getCurrentAssurance }));
  vi.doMock("next/navigation", () => ({ redirect }));
  vi.doMock("@/lib/admin/account-api", async () => {
    const actual =
      await vi.importActual<typeof import("@/lib/admin/account-api")>("@/lib/admin/account-api");
    return {
      ...actual,
      fetchAccountApiAdminAuditEvents,
      fetchAccountApiAdminReports,
      fetchAccountApiAdminConfiguration,
      fetchAccountApiAdminCredentialStatus,
      fetchAccountApiAdminMetrics,
      fetchAccountApiAdminReleaseStatus,
      fetchAccountApiAdminNotificationEmailQueue,
      fetchAccountApiAdminNotifications,
      fetchAccountApiAdminUser,
      fetchAccountApiAdminUsers,
      fetchAccountApiMe,
      fetchAccountApiRoleReport,
    };
  });

  const access = await import("@/lib/admin/access");
  return {
    access,
    createServerSupabaseClient,
    fetchAccountApiAdminAuditEvents,
    fetchAccountApiAdminReports,
    fetchAccountApiAdminConfiguration,
    fetchAccountApiAdminCredentialStatus,
    fetchAccountApiAdminMetrics,
    fetchAccountApiAdminReleaseStatus,
    fetchAccountApiAdminNotificationEmailQueue,
    fetchAccountApiAdminNotifications,
    fetchAccountApiAdminUser,
    fetchAccountApiAdminUsers,
    fetchAccountApiMe,
    fetchAccountApiRoleReport,
    getCurrentAssurance,
    redirect,
  };
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/supabase/server");
  vi.doUnmock("@/lib/dal/assurance-guard");
  vi.doUnmock("next/navigation");
  vi.doUnmock("@/lib/admin/account-api");
});

describe("admin access gates", () => {
  it("loads notifications only with the notification capability and AAL2", async () => {
    const { access, fetchAccountApiAdminNotifications } = await loadAccessHarness({
      mePayload: { ...me, capabilities: [...me.capabilities, "notifications:write"] },
    });
    await expect(access.getAdminNotificationsAccess()).resolves.toMatchObject({
      status: "authorized",
      notifications,
    });
    expect(fetchAccountApiAdminNotifications).toHaveBeenCalledWith("bearer-token");
  });

  it("does not fetch notification targets without authoring capability", async () => {
    const { access, fetchAccountApiAdminNotifications } = await loadAccessHarness();
    await expect(access.getAdminNotificationsAccess()).resolves.toMatchObject({
      status: "capability-required",
    });
    expect(fetchAccountApiAdminNotifications).not.toHaveBeenCalled();
  });

  it("does not fetch notifications before the privileged challenge", async () => {
    const { access, fetchAccountApiAdminNotifications } = await loadAccessHarness({
      mePayload: { ...me, capabilities: [...me.capabilities, "notifications:write"] },
      assurancePayload: { ...assurance, currentLevel: "aal1" },
    });
    await expect(access.getAdminNotificationsAccess()).resolves.toMatchObject({
      status: "mfa-required",
    });
    expect(fetchAccountApiAdminNotifications).not.toHaveBeenCalled();
  });

  it("loads the email queue only with the notification capability and AAL2", async () => {
    const { access, fetchAccountApiAdminNotificationEmailQueue } = await loadAccessHarness({
      mePayload: { ...me, capabilities: [...me.capabilities, "notifications:write"] },
    });
    await expect(access.getAdminEmailAccess()).resolves.toMatchObject({
      status: "authorized",
      queue: emailQueue,
    });
    expect(fetchAccountApiAdminNotificationEmailQueue).toHaveBeenCalledWith("bearer-token");
  });

  it("does not fetch the email queue without capability or before MFA", async () => {
    const withoutCapability = await loadAccessHarness();
    await expect(withoutCapability.access.getAdminEmailAccess()).resolves.toMatchObject({
      status: "capability-required",
      capability: "notifications:write",
    });
    expect(withoutCapability.fetchAccountApiAdminNotificationEmailQueue).not.toHaveBeenCalled();

    const beforeMfa = await loadAccessHarness({
      mePayload: { ...me, capabilities: [...me.capabilities, "notifications:write"] },
      assurancePayload: { ...assurance, currentLevel: "aal1" },
    });
    await expect(beforeMfa.access.getAdminEmailAccess()).resolves.toMatchObject({
      status: "mfa-required",
    });
    expect(beforeMfa.fetchAccountApiAdminNotificationEmailQueue).not.toHaveBeenCalled();
  });

  it("loads owner-only platform status after exact capabilities and AAL2", async () => {
    const harness = await loadAccessHarness();

    await expect(harness.access.getAdminConfigurationAccess()).resolves.toMatchObject({
      status: "authorized",
      configuration,
    });
    await expect(harness.access.getAdminCredentialStatusAccess()).resolves.toMatchObject({
      status: "authorized",
      credentialStatus,
    });
    await expect(harness.access.getAdminReleaseStatusAccess()).resolves.toMatchObject({
      status: "authorized",
      releaseStatus,
    });

    expect(harness.fetchAccountApiAdminConfiguration).toHaveBeenCalledWith("bearer-token");
    expect(harness.fetchAccountApiAdminCredentialStatus).toHaveBeenCalledWith("bearer-token");
    expect(harness.fetchAccountApiAdminReleaseStatus).toHaveBeenCalledWith("bearer-token");
  });

  it("does not fetch owner-only platform status without capabilities or before MFA", async () => {
    const withoutCapabilities = await loadAccessHarness({
      mePayload: { ...me, capabilities: ["account:read-self", "account:read-any"] },
    });
    await expect(withoutCapabilities.access.getAdminConfigurationAccess()).resolves.toMatchObject({
      status: "capability-required",
      capability: "configuration:read",
    });
    expect(withoutCapabilities.fetchAccountApiAdminConfiguration).not.toHaveBeenCalled();

    const beforeMfa = await loadAccessHarness({
      assurancePayload: { ...assurance, currentLevel: "aal1" },
    });
    await expect(beforeMfa.access.getAdminCredentialStatusAccess()).resolves.toMatchObject({
      status: "mfa-required",
    });
    await expect(beforeMfa.access.getAdminReleaseStatusAccess()).resolves.toMatchObject({
      status: "mfa-required",
    });
    expect(beforeMfa.fetchAccountApiAdminCredentialStatus).not.toHaveBeenCalled();
    expect(beforeMfa.fetchAccountApiAdminReleaseStatus).not.toHaveBeenCalled();
  });

  it("fetches aggregate admin metrics for an authorized dashboard", async () => {
    const { access, fetchAccountApiAdminMetrics, fetchAccountApiRoleReport } =
      await loadAccessHarness();

    await expect(access.getAdminDashboardAccess()).resolves.toMatchObject({
      status: "authorized",
      metrics: { correlation_id: "qt-metrics" },
      roleReport: { correlation_id: "qt-role-report" },
    });
    expect(fetchAccountApiAdminMetrics).toHaveBeenCalledWith("bearer-token");
    expect(fetchAccountApiRoleReport).toHaveBeenCalledWith("bearer-token", {
      includeMatches: false,
    });
  });

  it("redirects a missing admin role-report session to the admin roles return path", async () => {
    const { access, redirect } = await loadAccessHarness({ sessionToken: null });

    await expect(access.getAdminRoleReportAccess(false)).rejects.toThrowError(
      "NEXT_REDIRECT:/login?next=%2Fadmin%2Froles",
    );
    expect(redirect).toHaveBeenCalledWith("/login?next=%2Fadmin%2Froles");
  });

  it("fetches the role report with the reviewed include-matches scope", async () => {
    const { access, fetchAccountApiMe, fetchAccountApiRoleReport } = await loadAccessHarness();

    await expect(access.getAdminRoleReportAccess(true)).resolves.toMatchObject({
      status: "authorized",
      includeMatches: true,
      roleReport: { correlation_id: "qt-role-report" },
    });
    expect(fetchAccountApiMe).toHaveBeenCalledWith("bearer-token");
    expect(fetchAccountApiRoleReport).toHaveBeenCalledWith("bearer-token", {
      includeMatches: true,
    });
  });

  it("fetches the admin user directory with bounded pagination", async () => {
    const { access, fetchAccountApiAdminUsers } = await loadAccessHarness();

    await expect(access.getAdminUsersAccess(25, 50)).resolves.toMatchObject({
      status: "authorized",
      users: { correlation_id: "qt-users" },
    });
    expect(fetchAccountApiAdminUsers).toHaveBeenCalledWith("bearer-token", {
      limit: 25,
      offset: 50,
    });
  });

  it("fetches one admin user detail record", async () => {
    const { access, fetchAccountApiAdminUser } = await loadAccessHarness();

    await expect(access.getAdminUserDetailAccess(USER_ID)).resolves.toMatchObject({
      status: "authorized",
      detail: { correlation_id: "qt-user-detail" },
    });
    expect(fetchAccountApiAdminUser).toHaveBeenCalledWith("bearer-token", USER_ID);
  });

  it("fetches audit events with bounded filters when the capability is granted", async () => {
    const { access, fetchAccountApiAdminAuditEvents } = await loadAccessHarness({
      mePayload: { ...me, capabilities: [...me.capabilities, "audit:read"] },
    });
    const filters = { event_type: "session.revoked", subject_user_id: USER_ID };

    await expect(access.getAdminAuditEventsAccess(25, 50, filters)).resolves.toMatchObject({
      status: "authorized",
      auditEvents: { correlation_id: "qt-audit" },
    });
    expect(fetchAccountApiAdminAuditEvents).toHaveBeenCalledWith("bearer-token", {
      filters,
      limit: 25,
      offset: 50,
    });
  });

  it("fetches private report jobs only after audit capability and AAL2", async () => {
    const { access, fetchAccountApiAdminReports } = await loadAccessHarness({
      mePayload: { ...me, capabilities: [...me.capabilities, "audit:read"] },
    });

    await expect(access.getAdminReportsAccess()).resolves.toMatchObject({
      status: "authorized",
      reports: { correlation_id: "qt-reports" },
    });
    expect(fetchAccountApiAdminReports).toHaveBeenCalledWith("bearer-token");
  });

  it("maps an admin user detail miss to a local not-found state", async () => {
    const notFound = new AccountApiRequestError({
      status: 404,
      code: "not_found",
      message: "Not found",
      correlationId: "qt-miss",
    });
    const { access } = await loadAccessHarness({ userDetailError: notFound });

    await expect(access.getAdminUserDetailAccess(USER_ID)).resolves.toMatchObject({
      status: "not-found",
    });
  });

  it("refuses role reconciliation when the backend does not grant the capability", async () => {
    const { access, fetchAccountApiRoleReport } = await loadAccessHarness({
      mePayload: { ...me, capabilities: ["account:read-self", "account:read-any"] },
    });

    await expect(access.getAdminRoleReportAccess(false)).resolves.toMatchObject({
      status: "capability-required",
      capability: "roles:read-report",
    });
    expect(fetchAccountApiRoleReport).not.toHaveBeenCalled();
  });

  it("refuses audit search when the backend does not grant the capability", async () => {
    const { access, fetchAccountApiAdminAuditEvents, fetchAccountApiAdminReports } =
      await loadAccessHarness();

    await expect(access.getAdminAuditEventsAccess(50, 0, {})).resolves.toMatchObject({
      status: "capability-required",
      capability: "audit:read",
    });
    await expect(access.getAdminReportsAccess()).resolves.toMatchObject({
      status: "capability-required",
      capability: "audit:read",
    });
    expect(fetchAccountApiAdminAuditEvents).not.toHaveBeenCalled();
    expect(fetchAccountApiAdminReports).not.toHaveBeenCalled();
  });

  it("requires AAL2 before fetching role data for a privileged role", async () => {
    const {
      access,
      fetchAccountApiAdminAuditEvents,
      fetchAccountApiAdminReports,
      fetchAccountApiAdminUsers,
      fetchAccountApiRoleReport,
    } = await loadAccessHarness({
      assurancePayload: { ...assurance, currentLevel: "aal1", challengeRequired: true },
    });

    await expect(access.getAdminRoleReportAccess(false)).resolves.toMatchObject({
      status: "mfa-required",
    });
    await expect(access.getAdminUsersAccess(50, 0)).resolves.toMatchObject({
      status: "mfa-required",
    });
    await expect(access.getAdminAuditEventsAccess(50, 0, {})).resolves.toMatchObject({
      status: "mfa-required",
    });
    await expect(access.getAdminReportsAccess()).resolves.toMatchObject({
      status: "mfa-required",
    });
    expect(fetchAccountApiAdminAuditEvents).not.toHaveBeenCalled();
    expect(fetchAccountApiAdminReports).not.toHaveBeenCalled();
    expect(fetchAccountApiAdminUsers).not.toHaveBeenCalled();
    expect(fetchAccountApiRoleReport).not.toHaveBeenCalled();
  });
});
