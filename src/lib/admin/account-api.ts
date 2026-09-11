import "server-only";

import { z } from "zod";

import { ASSIGNABLE_ROLES, type AssignableRole } from "@/lib/admin/role-labels";

export { ASSIGNABLE_ROLES, type AssignableRole };
export const ADMIN_ENTRY_CAPABILITY = "account:read-any";
export const ROLE_REPORT_CAPABILITY = "roles:read-report";
export const MANAGE_ROLES_CAPABILITY = "roles:write";
export const ROLE_WRITE_CAPABILITY = MANAGE_ROLES_CAPABILITY;
/** The versioned path every Account API route lives under (`host.json` routePrefix). */
export const ACCOUNT_API_ROUTE_PREFIX = "/api/v1";
export const AUDIT_EVENTS_CAPABILITY = "audit:read";
export const USER_ACTIVATION_CAPABILITY = "users:set-active";
export const USER_SESSION_REVOKE_CAPABILITY = "sessions:revoke-any";
export const NOTIFICATIONS_CAPABILITY = "notifications:write";
export const CONFIGURATION_CAPABILITY = "configuration:read";
export const CREDENTIAL_STATUS_CAPABILITY = "credentials:read-status";
export const RELEASE_STATUS_CAPABILITY = "releases:read-status";

type Fetcher = (input: URL, init: RequestInit) => Promise<Response>;

export class AccountApiUnavailableError extends Error {
  readonly correlationId: string | null;

  constructor(correlationId: string | null = null) {
    super("Account administration is temporarily unavailable.");
    this.name = "AccountApiUnavailableError";
    this.correlationId = correlationId;
  }
}

/**
 * Server-side breadcrumb for an Account API failure. Deliberately narrow: the route,
 * the outcome, and the correlation id are enough to find the matching backend log line,
 * and nothing that could carry a token, a body, or a header is ever included.
 */
function logAccountApiFailure(
  route: string,
  method: string,
  detail: Readonly<Record<string, string | number | null>>,
): void {
  const fields = Object.entries({ route, method, ...detail })
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  console.error(`[account-api] ${fields}`);
}

function schemaIssuePaths(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => issue.path.map(String).join(".") || "<root>")
    .join(",");
}

function parseAccountApiPayload<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  route: string,
  method = "GET",
): T {
  const parsed = schema.safeParse(payload);
  if (parsed.success) return parsed.data;
  const correlationId =
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { correlation_id?: unknown }).correlation_id === "string"
      ? (payload as { correlation_id: string }).correlation_id
      : null;
  logAccountApiFailure(route, method, {
    outcome: "schema_mismatch",
    issues: schemaIssuePaths(parsed.error),
    correlation_id: correlationId,
  });
  throw new AccountApiUnavailableError(correlationId);
}

export class AccountApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly correlationId: string | null;
  readonly details: Readonly<Record<string, unknown>>;

  constructor({
    status,
    code,
    message,
    correlationId,
    details = {},
  }: {
    status: number;
    code: string;
    message: string;
    correlationId: string | null;
    details?: Readonly<Record<string, unknown>>;
  }) {
    super(message);
    this.name = "AccountApiRequestError";
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
    this.details = details;
  }
}

const roleSchema = z.enum(["owner", "admin", "support", "user"]);
const nullableRoleSchema = roleSchema.nullable();
const correlationSchema = z.string().min(1).max(160);

const accountApiErrorSchema = z
  .object({
    ok: z.literal(false),
    correlation_id: correlationSchema.optional(),
    error: z
      .object({
        code: z.string().min(1).max(96),
        message: z.string().min(1).max(240),
      })
      .passthrough(),
  })
  .passthrough();

export const accountApiMeSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    user: z
      .object({
        user_id: z.guid(),
        email: z.string().email().max(254),
        is_active: z.boolean(),
      })
      .strict(),
    role: z
      .object({
        effective: roleSchema,
        database: nullableRoleSchema,
        legacy: nullableRoleSchema,
        mismatch: z.string().min(1).max(96),
        break_glass: z.boolean(),
      })
      .strict(),
    capabilities: z.array(z.string().min(1).max(96)).max(64),
    environment: z.string().min(1).max(64),
  })
  .strict();

// A profile created before the versioned write path exists carries version 0; that is a
// readable profile, not a malformed one, and the compare-and-swap still works from 0.
const profileVersionSchema = z.number().int().nonnegative();

const accountProfileSchema = z
  .object({
    user_id: z.guid(),
    first_name: z.string().max(80),
    last_name: z.string().max(80),
    email: z.string().max(254),
    phone: z.string().max(32),
    country: z.string().max(80),
    is_admin: z.boolean(),
    is_active: z.boolean(),
    timezone: z.string().max(80),
    default_currency: z.string().max(3),
    subscription_tier: z.string().max(64),
    two_factor_enabled: z.boolean(),
    notify_price_alerts: z.boolean(),
    notify_portfolio_moves: z.boolean(),
    notify_news_digest: z.boolean(),
    data_refresh_rate: z.string().max(64),
    theme_preference: z.string().max(64),
    profile_version: profileVersionSchema,
    created_at: z.string().max(64),
    last_login_at: z.string().max(64),
    updated_at: z.string().max(64),
  })
  .strict();

const accountProfileMutationReceiptSchema = z
  .object({
    user_id: z.guid(),
    profile_version: profileVersionSchema,
    updated_at: z.string().max(64),
  })
  .strict();

export const accountApiProfileSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    profile: accountProfileSchema,
  })
  .strict();

export const accountApiProfileUpdateSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    profile: accountProfileMutationReceiptSchema,
  })
  .strict();

const roleReportEntrySchema = z
  .object({
    user_id: z.guid(),
    effective_role: roleSchema,
    database_role: nullableRoleSchema,
    legacy_role: nullableRoleSchema,
    mismatch: z.string().min(1).max(96),
    break_glass: z.boolean(),
  })
  .strict();

export const accountApiRoleReportSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    legacy_source_available: z.boolean(),
    legacy_retirement_ready: z.boolean(),
    legacy_blob_entry_count: z.number().int().nonnegative(),
    legacy_unparsable_entry_count: z.number().int().nonnegative(),
    legacy_entry_count: z.number().int().nonnegative(),
    legacy_bootstrap_count: z.number().int().nonnegative(),
    counts_by_mismatch: z.record(z.string(), z.number().int().nonnegative()),
    counts_by_role: z.record(roleSchema, z.number().int().nonnegative()),
    total_users: z.number().int().nonnegative(),
    break_glass_disclosed: z.boolean(),
    entries: z.array(roleReportEntrySchema).max(500),
  })
  .strict();

const metricCounterSchema = z
  .record(z.string().min(1).max(64), z.number().int().nonnegative())
  .refine((value) => Object.keys(value).length <= 64);

const metricDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

const metricCountPointSchema = z
  .object({ date: metricDaySchema, count: z.number().int().nonnegative() })
  .strict();

const metricOutcomePointSchema = z
  .object({
    date: metricDaySchema,
    success: z.number().int().nonnegative(),
    failure: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
  })
  .strict();

/** Daily aggregates for the trailing window; nothing per-account is carried. */
const metricSeriesSchema = z
  .object({
    days: z.number().int().nonnegative().max(366),
    signups: z.array(metricCountPointSchema).max(366),
    sign_ins: z.array(metricCountPointSchema).max(366),
    auth_events: z.array(metricOutcomePointSchema).max(366),
  })
  .strict();

const adminUserRoleSchema = z
  .object({
    effective: roleSchema,
    database: nullableRoleSchema,
    legacy: nullableRoleSchema,
    mismatch: z.string().min(1).max(96),
    break_glass: z.boolean(),
  })
  .strict();

const adminUserSummarySchema = z
  .object({
    user: z
      .object({
        user_id: z.guid(),
        email: z.string().max(254),
        first_name: z.string().max(80),
        last_name: z.string().max(80),
        display_name: z.string().max(180),
        is_active: z.boolean(),
        subscription_tier: z.string().max(64),
        created_at: z.string().max(64),
        last_login_at: z.string().max(64),
        updated_at: z.string().max(64),
      })
      .strict(),
    role: adminUserRoleSchema,
  })
  .strict();

const adminSessionSchema = z
  .object({
    id: z.guid(),
    user_id: z.guid(),
    source: z.string().min(1).max(32),
    provider: z.string().min(1).max(32),
    client_instance_id: z.string().max(256).nullable(),
    device_name: z.string().max(200).nullable(),
    created_at: z.string().max(64).nullable(),
    last_seen_at: z.string().max(64).nullable(),
    expires_at: z.string().max(64).nullable(),
    revoked_at: z.string().max(64).nullable(),
    revoke_reason: z.string().max(80).nullable(),
  })
  .strict();

const adminActivitySchema = z
  .object({
    id: z.guid(),
    user_id: z.guid().nullable(),
    session_id: z.guid().nullable(),
    event_type: z.string().min(1).max(96),
    outcome: z.enum(["success", "failure", "blocked", "unknown"]),
    source: z.string().min(1).max(32),
    occurred_at: z.string().max(64).nullable(),
    created_at: z.string().max(64).nullable(),
  })
  .strict();

const accountActivitySchema = adminActivitySchema
  .extend({
    user_id: z.guid(),
  })
  .strict();

export const accountApiSessionsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    sessions: z.array(adminSessionSchema).max(50),
  })
  .strict();

export const accountApiActivitySchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    events: z.array(accountActivitySchema).max(100),
  })
  .strict();

export const accountApiAdminMetricsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    window: z
      .object({
        hours: z.literal(24),
        since: z.string().min(1).max(64),
      })
      .strict(),
    accounts: z
      .object({
        total: z.number().int().nonnegative(),
        active: z.number().int().nonnegative(),
        inactive: z.number().int().nonnegative(),
        created_24h: z.number().int().nonnegative(),
        logged_in_24h: z.number().int().nonnegative(),
        created_7d: z.number().int().nonnegative().optional(),
        created_30d: z.number().int().nonnegative().optional(),
        logged_in_7d: z.number().int().nonnegative().optional(),
      })
      .strict(),
    series: metricSeriesSchema.optional(),
    sessions: z
      .object({
        total: z.number().int().nonnegative(),
        active: z.number().int().nonnegative(),
        expired: z.number().int().nonnegative(),
        revoked: z.number().int().nonnegative(),
        by_source: metricCounterSchema,
      })
      .strict(),
    auth_events_24h: z
      .object({
        total: z.number().int().nonnegative(),
        by_type: metricCounterSchema,
        by_outcome: metricCounterSchema,
        by_source: metricCounterSchema,
      })
      .strict(),
    limits: z
      .object({
        row_limit: z.number().int().positive(),
        accounts_truncated: z.boolean(),
        sessions_truncated: z.boolean(),
        events_truncated: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const accountApiAdminConfigurationSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    environment: z.string().min(1).max(64),
    cors: z
      .object({
        allowed_origin_count: z.number().int().nonnegative().max(1000),
        wildcard_allowed: z.boolean(),
      })
      .strict(),
    limits: z
      .object({
        max_body_bytes: z.number().int().positive().max(1_048_576),
        upstream_timeout_seconds: z.number().positive().max(15),
        idempotency_ttl_seconds: z
          .number()
          .int()
          .positive()
          .max(7 * 24 * 60 * 60),
        reservation_lease_seconds: z
          .number()
          .int()
          .positive()
          .max(60 * 60),
        email_worker_batch_limit: z.number().int().positive().max(25),
        artifact_worker_batch_limit: z.number().int().positive().max(10),
        deletion_worker_batch_limit: z.number().int().positive().max(5),
        signed_download_ttl_seconds: z
          .number()
          .int()
          .positive()
          .max(60 * 60),
      })
      .strict(),
    features: z
      .object({
        email_worker_enabled: z.boolean(),
        artifact_worker_enabled: z.boolean(),
        deletion_worker_enabled: z.boolean(),
        signed_downloads_enabled: z.boolean(),
        account_export_encryption_configured: z.boolean(),
        private_artifact_storage_configured: z.boolean(),
        legacy_role_source_configured: z.boolean(),
        break_glass_owner_count: z.number().int().nonnegative().max(1000),
        legacy_bootstrap_admin_count: z.number().int().nonnegative().max(1000),
      })
      .strict(),
  })
  .strict();

const credentialStatusSchema = z
  .object({
    name: z.string().min(1).max(80),
    configured: z.boolean(),
    secret: z.boolean(),
    rotation: z.enum(["source-locked"]),
  })
  .strict();

export const accountApiAdminCredentialStatusSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    credentials: z.array(credentialStatusSchema).max(32),
  })
  .strict();

export const accountApiAdminReleaseStatusSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    release_management: z
      .object({
        configured: z.boolean(),
        publish_enabled: z.boolean(),
        rollback_enabled: z.boolean(),
        requires_https_url: z.boolean(),
        requires_checksum: z.boolean(),
        requires_server_signature: z.boolean(),
        status: z.enum(["source-locked"]),
      })
      .strict(),
  })
  .strict();

export const accountApiAdminUsersSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    pagination: z
      .object({
        limit: z.number().int().min(1).max(100),
        offset: z.number().int().nonnegative().max(100000),
        has_more: z.boolean(),
        next_offset: z.number().int().nonnegative().max(100100).nullable(),
        total: z.number().int().nonnegative().optional(),
      })
      .strict(),
    users: z.array(adminUserSummarySchema).max(100),
  })
  .strict();

export const accountApiAdminUserDetailSchema = adminUserSummarySchema
  .extend({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    sessions: z.array(adminSessionSchema).max(10),
    activity: z.array(adminActivitySchema).max(20),
  })
  .strict();

export const accountApiAdminUserActivationSchema = adminUserSummarySchema
  .extend({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.string().max(64),
      })
      .strict(),
    replayed: z.boolean(),
    legacy_mirrored: z.boolean(),
  })
  .strict();

export const accountApiAdminUserSessionRevokeSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    session: adminSessionSchema,
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.string().max(64),
        outcome: z.enum(["success", "failure", "blocked", "unknown"]),
      })
      .strict()
      .nullable(),
    replayed: z.boolean(),
    legacy_mirrored: z.boolean(),
  })
  .strict();

const adminAuditEventSchema = z
  .object({
    id: z.string().max(64),
    subject_user_id: z.guid().nullable(),
    subject_email: z.string().max(254).nullable().optional(),
    actor_user_id: z.guid().nullable(),
    actor_email: z.string().max(254).nullable().optional(),
    session_id: z.guid().nullable(),
    event_type: z.string().min(1).max(96),
    outcome: z.enum(["success", "failure", "blocked", "unknown"]),
    source: z.string().min(1).max(32),
    request_id: z.string().max(160).nullable(),
    occurred_at: z.string().max(64),
    created_at: z.string().max(64),
    summary: z.object({ actor_role: z.string().max(32) }).strict(),
  })
  .strict();

export const accountApiAdminAuditEventsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    pagination: z
      .object({
        limit: z.number().int().min(1).max(100),
        offset: z.number().int().nonnegative().max(100000),
        has_more: z.boolean(),
        next_offset: z.number().int().nonnegative().max(100100).nullable(),
      })
      .strict(),
    filters: z.record(z.string().min(1).max(32), z.string().max(160)),
    events: z.array(adminAuditEventSchema).max(100),
  })
  .strict();

const adminReportDownloadSchema = z
  .object({
    available: z.boolean(),
    private: z.boolean(),
    source_locked: z.boolean(),
    content_type: z.literal("text/csv; charset=utf-8"),
    filename: z.string().min(1).max(140),
    expires_at: z.string().max(64),
    ttl_seconds: z.number().int().positive().max(3600),
    byte_count: z.number().int().nonnegative().max(10_000_000),
    sha256: z.string().max(64),
    url: z.string().url().max(2048).nullable(),
  })
  .strict();

const adminReportJobSchema = z
  .object({
    id: z.guid(),
    report_type: z.literal("audit-events"),
    format: z.literal("csv"),
    filters: z.record(z.string().min(1).max(32), z.string().max(160)),
    status: z.enum(["queued", "retry", "ready", "failed", "expired"]),
    queued_at: z.string().max(64),
    generated_at: z.string().max(64),
    expires_at: z.string().max(64),
    attempts: z.number().int().nonnegative().max(100),
    max_attempts: z.number().int().positive().max(10),
    next_attempt_at: z.string().max(64),
    last_error: z.string().max(240),
    row_count: z.number().int().nonnegative().max(1000),
    download: adminReportDownloadSchema,
  })
  .strict();

export const accountApiAdminReportsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    generated_at: z.string().min(1).max(64),
    queue: z
      .object({
        job_limit: z.number().int().positive().max(200),
        returned: z.number().int().nonnegative().max(200),
      })
      .strict(),
    jobs: z.array(adminReportJobSchema).max(200),
  })
  .strict();

export const accountApiAdminReportEnqueueSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    job: adminReportJobSchema,
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.literal("reports.queued"),
      })
      .strict()
      .nullable(),
    replayed: z.boolean(),
    legacy_mirrored: z.boolean(),
  })
  .strict();

export const accountApiAdminReportDownloadSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    job: adminReportJobSchema,
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.literal("reports.download_requested"),
      })
      .strict()
      .nullable(),
    legacy_mirrored: z.boolean(),
  })
  .strict();

const accountExportDownloadSchema = z
  .object({
    available: z.boolean(),
    private: z.boolean(),
    encrypted: z.boolean(),
    source_locked: z.boolean(),
    // Older API builds described the encrypted artifact as JSON; both are the same file.
    content_type: z.enum(["application/octet-stream", "application/json"]),
    filename: z.string().min(1).max(180),
    expires_at: z.string().max(64),
    ttl_seconds: z.number().int().positive().max(3600),
    byte_count: z.number().int().nonnegative().max(100_000_000),
    sha256: z.string().max(64),
    url: z.string().url().max(2048).nullable(),
  })
  .strict();

const accountExportJobSchema = z
  .object({
    id: z.guid(),
    format: z.literal("json"),
    status: z.enum(["queued", "retry", "ready", "failed", "expired"]),
    requested_at: z.string().max(64),
    generated_at: z.string().max(64),
    expires_at: z.string().max(64),
    attempts: z.number().int().nonnegative().max(100),
    max_attempts: z.number().int().positive().max(10),
    next_attempt_at: z.string().max(64),
    last_error: z.string().max(240),
    byte_count: z.number().int().nonnegative().max(100_000_000),
    sections: z.array(z.string().min(1).max(40)).max(32),
    download: accountExportDownloadSchema,
  })
  .strict();

const accountDeletionRequestSchema = z
  .object({
    id: z.guid(),
    status: z.enum(["pending", "cancelled", "processing", "completed", "failed", "blocked"]),
    requested_at: z.string().max(64),
    scheduled_delete_at: z.string().max(64),
    cancelled_at: z.string().max(64),
    completed_at: z.string().max(64),
    cooling_off_seconds: z
      .number()
      .int()
      .positive()
      .max(31 * 24 * 60 * 60),
    can_cancel: z.boolean(),
    legal_hold: z.boolean(),
    hold_reason: z.string().max(120),
    cleanup: z
      .record(
        z.string().min(1).max(40),
        z.enum(["pending", "source-locked", "retry", "complete", "failed", "skipped"]),
      )
      .refine((value) => Object.keys(value).length <= 16),
    attempts: z.number().int().nonnegative().max(100),
    max_attempts: z.number().int().positive().max(10),
    next_attempt_at: z.string().max(64),
    last_error: z.string().max(240),
    offline_desktop_cache_note: z.literal("not-remotely-deletable"),
  })
  .strict();

export const accountApiAccountLifecycleSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    generated_at: z.string().min(1).max(64),
    export_queue: z
      .object({
        job_limit: z.number().int().positive().max(500),
        returned: z.number().int().nonnegative().max(50),
        per_user_limit: z.number().int().positive().max(50),
      })
      .strict(),
    exports: z.array(accountExportJobSchema).max(50),
    deletion: z
      .object({
        active: accountDeletionRequestSchema.nullable(),
        requests: z.array(accountDeletionRequestSchema).max(10),
      })
      .strict(),
  })
  .strict();

export const accountApiAccountExportRequestSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    export: accountExportJobSchema,
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.literal("account.export_requested"),
      })
      .strict()
      .nullable(),
    replayed: z.boolean(),
    legacy_mirrored: z.boolean(),
  })
  .strict();

export const accountApiAccountExportDownloadSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    export: accountExportJobSchema,
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.literal("account.export_download_requested"),
      })
      .strict()
      .nullable(),
    legacy_mirrored: z.boolean(),
  })
  .strict();

export const accountApiAccountDeletionResultSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    deletion: accountDeletionRequestSchema,
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.enum(["account.deletion_requested", "account.deletion_cancelled"]),
      })
      .strict()
      .nullable(),
    replayed: z.boolean(),
    legacy_mirrored: z.boolean(),
  })
  .strict();

const notificationActionSchema = z
  .object({
    label: z.string().max(60),
    url: z.string().max(500),
    kind: z.string().max(24),
    primary: z.boolean(),
  })
  .strict();

const notificationSchema = z
  .object({
    id: z.string().min(1).max(64),
    title: z.string().max(140),
    body: z.string().max(4000),
    severity: z.enum(["info", "success", "warning", "critical"]),
    display: z.enum(["popup", "center"]),
    dismissible: z.boolean(),
    active: z.boolean(),
    created_at: z.string().max(64),
    starts_at: z.string().max(64),
    expires_at: z.string().max(64),
    actions: z.array(notificationActionSchema).max(4),
  })
  .strict();

const notificationTargetSchema = z
  .object({
    mode: z.enum(["all", "active", "selected"]),
    user_ids: z.array(z.guid()).max(5000),
    emails: z.array(z.string().email().max(254)).max(5000),
  })
  .strict();

const adminNotificationSchema = notificationSchema
  .extend({
    target: notificationTargetSchema,
  })
  .strict();

export const accountApiNotificationsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    notifications: z.array(notificationSchema).max(200),
  })
  .strict();

export const accountApiAdminNotificationsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    notifications: z.array(adminNotificationSchema).max(200),
  })
  .strict();

export const accountApiAdminNotificationsUpdateSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    count: z.number().int().nonnegative().max(200),
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.string().max(64),
      })
      .strict()
      .nullable(),
    replayed: z.boolean(),
    legacy_mirrored: z.boolean(),
  })
  .strict();

const notificationEmailJobSchema = z
  .object({
    id: z.guid(),
    subject: z.string().max(140),
    body: z.string().max(4000),
    target: notificationTargetSchema,
    status: z.enum(["queued", "retry", "sent", "dead"]),
    queued_at: z.string().max(64),
    scheduled_at: z.string().max(64),
    attempts: z.number().int().nonnegative().max(100),
    max_attempts: z.number().int().positive().max(10),
    next_attempt_at: z.string().max(64),
    last_error: z.string().max(240),
    last_attempt_at: z.string().max(64),
    completed_at: z.string().max(64),
  })
  .strict();

export const accountApiAdminNotificationEmailQueueSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    generated_at: z.string().min(1).max(64),
    quota: z
      .object({
        daily_limit: z.number().int().positive().max(1000),
        queued_24h: z.number().int().nonnegative().max(1000),
        queue_limit: z.number().int().positive().max(5000),
      })
      .strict(),
    jobs: z.array(notificationEmailJobSchema).max(500),
  })
  .strict();

export const accountApiAdminNotificationEmailEnqueueSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    revision: z.string().max(64),
    job: notificationEmailJobSchema,
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.string().max(64),
      })
      .strict()
      .nullable(),
    replayed: z.boolean(),
    legacy_mirrored: z.boolean(),
  })
  .strict();

export const accountApiNotificationReceiptSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    receipt: z
      .object({
        notification_id: z.string().min(1).max(64),
        status: z.enum(["seen", "read", "dismissed", "clicked"]),
      })
      .strict(),
    event: z
      .object({
        id: z.string().max(64),
        event_type: z.string().max(64),
      })
      .strict(),
    replayed: z.boolean(),
  })
  .strict();

const notificationReceiptStatusSchema = z.enum(["seen", "read", "dismissed", "clicked"]);

const notificationStateEntrySchema = z
  .object({
    notification_id: z.string().min(1).max(64),
    status: notificationReceiptStatusSchema,
    occurred_at: z.string().max(64),
  })
  .strict();

const notificationReceiptHistoryEntrySchema = notificationStateEntrySchema
  .extend({
    id: z.string().max(64),
    created_at: z.string().max(64),
  })
  .strict();

export const accountApiNotificationStateSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    state: z.array(notificationStateEntrySchema).max(200),
    receipts: z.array(notificationReceiptHistoryEntrySchema).max(100),
  })
  .strict();

export type AccountApiMe = z.infer<typeof accountApiMeSchema>;
export type AccountApiProfile = z.infer<typeof accountApiProfileSchema>;
export type AccountApiProfileUpdate = z.infer<typeof accountApiProfileUpdateSchema>;
export type AccountApiSessions = z.infer<typeof accountApiSessionsSchema>;
export type AccountApiActivity = z.infer<typeof accountApiActivitySchema>;
export type AccountApiRoleReport = z.infer<typeof accountApiRoleReportSchema>;
export type AccountApiAdminMetrics = z.infer<typeof accountApiAdminMetricsSchema>;
export type AccountApiAdminConfiguration = z.infer<typeof accountApiAdminConfigurationSchema>;
export type AccountApiAdminCredentialStatus = z.infer<typeof accountApiAdminCredentialStatusSchema>;
export type AccountApiAdminReleaseStatus = z.infer<typeof accountApiAdminReleaseStatusSchema>;
export type AccountApiAdminUsers = z.infer<typeof accountApiAdminUsersSchema>;
export type AccountApiAdminUserDetail = z.infer<typeof accountApiAdminUserDetailSchema>;
export type AccountApiAdminUserActivation = z.infer<typeof accountApiAdminUserActivationSchema>;
export type AccountApiAdminUserSessionRevoke = z.infer<
  typeof accountApiAdminUserSessionRevokeSchema
>;
export type AccountApiAdminAuditEvents = z.infer<typeof accountApiAdminAuditEventsSchema>;
export type AccountApiAdminReports = z.infer<typeof accountApiAdminReportsSchema>;
export type AccountApiAdminReportEnqueue = z.infer<typeof accountApiAdminReportEnqueueSchema>;
export type AccountApiAdminReportDownload = z.infer<typeof accountApiAdminReportDownloadSchema>;
export type AccountApiAccountLifecycle = z.infer<typeof accountApiAccountLifecycleSchema>;
export type AccountApiAccountExportRequest = z.infer<typeof accountApiAccountExportRequestSchema>;
export type AccountApiAccountExportDownload = z.infer<typeof accountApiAccountExportDownloadSchema>;
export type AccountApiAccountDeletionResult = z.infer<typeof accountApiAccountDeletionResultSchema>;
export type AccountApiNotifications = z.infer<typeof accountApiNotificationsSchema>;
export type AccountApiNotificationState = z.infer<typeof accountApiNotificationStateSchema>;
export type AccountApiAdminNotifications = z.infer<typeof accountApiAdminNotificationsSchema>;
export type AccountApiAdminNotificationsUpdate = z.infer<
  typeof accountApiAdminNotificationsUpdateSchema
>;
export type AccountApiAdminNotificationEmailQueue = z.infer<
  typeof accountApiAdminNotificationEmailQueueSchema
>;
export type AccountApiAdminNotificationEmailEnqueue = z.infer<
  typeof accountApiAdminNotificationEmailEnqueueSchema
>;
export type AccountApiNotificationReceipt = z.infer<typeof accountApiNotificationReceiptSchema>;
export type AccountApiNotificationReceiptStatus =
  AccountApiNotificationReceipt["receipt"]["status"];

type AccountApiFetchOptions = {
  environment?: Readonly<Partial<Record<string, string>>>;
  fetcher?: Fetcher;
  query?: Readonly<Record<string, string>>;
};

export const ADMIN_USER_STATUS_FILTERS = ["active", "inactive"] as const;
export type AdminUserStatusFilter = (typeof ADMIN_USER_STATUS_FILTERS)[number];

export type AccountApiAdminUserFilters = {
  /** Case-insensitive substring match on email, first name or last name. */
  q?: string | undefined;
  status?: AdminUserStatusFilter | undefined;
};

type AccountApiAdminUsersOptions = AccountApiFetchOptions &
  AccountApiAdminUserFilters & {
    limit?: number;
    offset?: number;
  };

export type AccountApiAdminAuditFilters = {
  actor_user_id?: string;
  event_type?: string;
  outcome?: string;
  request_id?: string;
  session_id?: string;
  source?: string;
  subject_user_id?: string;
};

type AccountApiAdminAuditOptions = AccountApiFetchOptions & {
  filters?: AccountApiAdminAuditFilters;
  limit?: number;
  offset?: number;
};

type AccountApiAdminReportBody = {
  expected_revision?: string;
  report_type: "audit-events";
  format: "csv";
  filters?: AccountApiAdminAuditFilters;
};

type AccountApiAccountExportBody = {
  expected_revision?: string;
  format: "json";
  confirmation: string;
};

type AccountApiAccountDeletionBody = {
  expected_revision?: string;
  confirmation: string;
};

type AccountApiAccountDeletionCancelBody = AccountApiAccountDeletionBody & {
  request_id: string;
};

export type AccountApiProfileUpdateBody = {
  expected_profile_version: number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  country?: string;
  timezone?: string;
  default_currency?: string;
  notify_price_alerts?: boolean;
  notify_portfolio_moves?: boolean;
  notify_news_digest?: boolean;
};

type AccountApiJsonRequestOptions = AccountApiFetchOptions & {
  body?: Readonly<Record<string, unknown>>;
  idempotencyKey?: string;
  method?: "GET" | "POST";
};

function isLocalOrigin(url: URL): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

export function resolveAccountApiBaseUrl(
  environment: Readonly<Partial<Record<string, string>>> = process.env,
): URL {
  const raw = String(environment.QT_ACCOUNT_API_URL ?? "").trim();
  if (!raw) throw new AccountApiUnavailableError();

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AccountApiUnavailableError();
  }

  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (!isLocalOrigin(url) && url.protocol !== "https:") ||
    (isLocalOrigin(url) && !["http:", "https:"].includes(url.protocol))
  ) {
    throw new AccountApiUnavailableError();
  }

  // The API publishes every route under `/api/v1`. Accept the base with or without that
  // suffix so a host-only value (the shape the auth client already tolerates) cannot send
  // this client to the platform's bodyless 404.
  const pathname = url.pathname.replace(/\/+$/u, "");
  url.pathname = pathname.endsWith(ACCOUNT_API_ROUTE_PREFIX)
    ? pathname
    : `${pathname}${ACCOUNT_API_ROUTE_PREFIX}`;
  return url;
}

export function buildAccountApiUrl(baseUrl: URL, route: string): URL {
  const routeName = route.replace(/^\/+/u, "");
  const url = new URL(baseUrl.toString());
  url.pathname = `${url.pathname.replace(/\/+$/u, "")}/${routeName}`;
  return url;
}

async function parseJson(response: Response, route: string, method: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    logAccountApiFailure(route, method, {
      outcome: "non_json_response",
      status: response.status,
      correlation_id: response.headers.get("x-correlation-id"),
    });
    throw new AccountApiUnavailableError(response.headers.get("x-correlation-id"));
  }
}

async function fetchAccountApiJson(
  route: string,
  accessToken: string,
  options: AccountApiJsonRequestOptions = {},
): Promise<unknown> {
  const token = accessToken.trim();
  if (!token) throw new AccountApiUnavailableError();

  const baseUrl = resolveAccountApiBaseUrl(options.environment);
  const url = buildAccountApiUrl(baseUrl, route);
  for (const [name, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(name, value);
  }
  const method = options.method ?? (options.body ? "POST" : "GET");
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
  let body: string | undefined;
  if (options.body) {
    body = JSON.stringify(options.body);
    headers["Content-Type"] = "application/json";
    if (!options.idempotencyKey) throw new AccountApiUnavailableError();
    headers["Idempotency-Key"] = options.idempotencyKey;
  }
  let response: Response;
  try {
    const requestInit: RequestInit = {
      method,
      cache: "no-store",
      headers,
    };
    if (body !== undefined) {
      requestInit.body = body;
    }
    response = await (options.fetcher ?? fetch)(url, requestInit);
  } catch (error) {
    logAccountApiFailure(route, method, {
      outcome: "network_error",
      reason: error instanceof Error ? error.name : "unknown",
    });
    throw new AccountApiUnavailableError();
  }
  const payload = await parseJson(response, route, method);

  if (!response.ok) {
    const parsed = accountApiErrorSchema.safeParse(payload);
    if (!parsed.success) {
      logAccountApiFailure(route, method, {
        outcome: "unrecognized_error_body",
        status: response.status,
        correlation_id: response.headers.get("x-correlation-id"),
      });
      throw new AccountApiUnavailableError(response.headers.get("x-correlation-id"));
    }
    // 401 is the caller's session ending, not a service fault; everything else is
    // worth a breadcrumb because the caller will render it as a generic failure.
    if (response.status !== 401) {
      logAccountApiFailure(route, method, {
        outcome: "api_error",
        status: response.status,
        code: parsed.data.error.code,
        correlation_id: parsed.data.correlation_id ?? null,
      });
    }
    throw new AccountApiRequestError({
      status: response.status,
      code: parsed.data.error.code,
      message: parsed.data.error.message,
      correlationId: parsed.data.correlation_id ?? null,
      details:
        "details" in parsed.data.error &&
        parsed.data.error.details &&
        typeof parsed.data.error.details === "object"
          ? (parsed.data.error.details as Record<string, unknown>)
          : {},
    });
  }

  return payload;
}

export async function postAccountApiJson(
  route: string,
  accessToken: string,
  body: Readonly<Record<string, unknown>>,
  options: AccountApiFetchOptions & { idempotencyKey: string } = { idempotencyKey: "" },
): Promise<unknown> {
  return fetchAccountApiJson(route, accessToken, {
    ...options,
    body,
    method: "POST",
  });
}

export async function fetchAccountApiMe(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiMe> {
  const payload = await fetchAccountApiJson("me", accessToken, options);
  return parseAccountApiPayload(accountApiMeSchema, payload, "me", "GET");
}

export const DESKTOP_HANDOFF_CLIENT = "desktop";

export const accountApiHandoffStartSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    code: z.string().min(16).max(128),
    expires_at: z.string().min(1).max(64),
  })
  .strict();

export type AccountApiHandoffStart = z.infer<typeof accountApiHandoffStartSchema>;

/**
 * Mints the one-time code the desktop app redeems, together with its PKCE verifier, for
 * a session of its own. The code is bound to the caller's account and to the challenge.
 */
export async function startAccountApiHandoff(
  accessToken: string,
  input: { challenge: string },
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiHandoffStart> {
  const payload = await postAccountApiJson(
    "auth/handoff/start",
    accessToken,
    { challenge: input.challenge, client: DESKTOP_HANDOFF_CLIENT },
    options,
  );
  return parseAccountApiPayload(
    accountApiHandoffStartSchema,
    payload,
    "auth/handoff/start",
    "POST",
  );
}

export async function fetchAccountApiProfile(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiProfile> {
  const payload = await fetchAccountApiJson("auth/user/profile", accessToken, options);
  return parseAccountApiPayload(accountApiProfileSchema, payload, "auth/user/profile", "GET");
}

export async function updateAccountApiProfile(
  accessToken: string,
  body: AccountApiProfileUpdateBody,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiProfileUpdate> {
  const payload = await postAccountApiJson("auth/user/profile/update", accessToken, body, options);
  return parseAccountApiPayload(
    accountApiProfileUpdateSchema,
    payload,
    "auth/user/profile/update",
    "POST",
  );
}

export async function fetchAccountApiSessions(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiSessions> {
  const payload = await fetchAccountApiJson("sessions", accessToken, options);
  return parseAccountApiPayload(accountApiSessionsSchema, payload, "sessions", "GET");
}

export async function fetchAccountApiActivity(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiActivity> {
  const payload = await fetchAccountApiJson("activity", accessToken, options);
  return parseAccountApiPayload(accountApiActivitySchema, payload, "activity", "GET");
}

export async function fetchAccountApiRoleReport(
  accessToken: string,
  options: AccountApiFetchOptions & { includeMatches?: boolean } = {},
): Promise<AccountApiRoleReport> {
  const { includeMatches = false, ...fetchOptions } = options;
  const requestOptions: AccountApiFetchOptions = includeMatches
    ? { ...fetchOptions, query: { include_matches: "true" } }
    : fetchOptions;
  const payload = await fetchAccountApiJson("admin/role-report", accessToken, requestOptions);
  return parseAccountApiPayload(accountApiRoleReportSchema, payload, "admin/role-report", "GET");
}

export async function fetchAccountApiAdminMetrics(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminMetrics> {
  const payload = await fetchAccountApiJson("admin/metrics", accessToken, options);
  return parseAccountApiPayload(accountApiAdminMetricsSchema, payload, "admin/metrics", "GET");
}

export async function fetchAccountApiAdminConfiguration(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminConfiguration> {
  const payload = await fetchAccountApiJson("admin/configuration", accessToken, options);
  return parseAccountApiPayload(
    accountApiAdminConfigurationSchema,
    payload,
    "admin/configuration",
    "GET",
  );
}

export async function fetchAccountApiAdminCredentialStatus(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminCredentialStatus> {
  const payload = await fetchAccountApiJson("admin/credentials", accessToken, options);
  return parseAccountApiPayload(
    accountApiAdminCredentialStatusSchema,
    payload,
    "admin/credentials",
    "GET",
  );
}

export async function fetchAccountApiAdminReleaseStatus(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminReleaseStatus> {
  const payload = await fetchAccountApiJson("admin/releases", accessToken, options);
  return parseAccountApiPayload(
    accountApiAdminReleaseStatusSchema,
    payload,
    "admin/releases",
    "GET",
  );
}

export async function fetchAccountApiAdminUsers(
  accessToken: string,
  options: AccountApiAdminUsersOptions = {},
): Promise<AccountApiAdminUsers> {
  const { limit = 50, offset = 0, q, status, ...fetchOptions } = options;
  const query: Record<string, string> = {
    ...(fetchOptions.query ?? {}),
    limit: String(limit),
    offset: String(offset),
  };
  const text = (q ?? "").trim();
  if (text) query.q = text.slice(0, 120);
  if (status) query.status = status;
  const payload = await fetchAccountApiJson("admin/users", accessToken, {
    ...fetchOptions,
    query,
  });
  return parseAccountApiPayload(accountApiAdminUsersSchema, payload, "admin/users", "GET");
}

export async function fetchAccountApiAdminUser(
  accessToken: string,
  userId: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminUserDetail> {
  const parsedUserId = z.guid().safeParse(userId.trim().toLowerCase());
  if (!parsedUserId.success) throw new AccountApiUnavailableError();
  const payload = await fetchAccountApiJson(
    `admin/users/${encodeURIComponent(parsedUserId.data)}`,
    accessToken,
    options,
  );
  return parseAccountApiPayload(
    accountApiAdminUserDetailSchema,
    payload,
    `admin/users/${encodeURIComponent(parsedUserId.data)}`,
    "GET",
  );
}

export async function fetchAccountApiAdminAuditEvents(
  accessToken: string,
  options: AccountApiAdminAuditOptions = {},
): Promise<AccountApiAdminAuditEvents> {
  const { filters = {}, limit = 50, offset = 0, ...fetchOptions } = options;
  const query: Record<string, string> = {
    ...(fetchOptions.query ?? {}),
    limit: String(limit),
    offset: String(offset),
  };
  for (const [name, value] of Object.entries(filters)) {
    const cleaned = String(value ?? "").trim();
    if (cleaned) query[name] = cleaned;
  }
  const payload = await fetchAccountApiJson("admin/audit-events/search", accessToken, {
    ...fetchOptions,
    query,
  });
  return parseAccountApiPayload(
    accountApiAdminAuditEventsSchema,
    payload,
    "admin/audit-events/search",
    "GET",
  );
}

export async function fetchAccountApiAdminReports(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminReports> {
  const payload = await fetchAccountApiJson("admin/reports", accessToken, options);
  return parseAccountApiPayload(accountApiAdminReportsSchema, payload, "admin/reports", "GET");
}

export async function enqueueAccountApiAdminReport(
  accessToken: string,
  body: AccountApiAdminReportBody,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminReportEnqueue> {
  const payload = await postAccountApiJson(
    "admin/reports/enqueue",
    accessToken,
    {
      report_type: body.report_type,
      format: body.format,
      filters: body.filters ?? {},
      ...(body.expected_revision !== undefined
        ? { expected_revision: body.expected_revision }
        : {}),
    },
    options,
  );
  return parseAccountApiPayload(
    accountApiAdminReportEnqueueSchema,
    payload,
    "admin/reports/enqueue",
    "POST",
  );
}

export async function fetchAccountApiAdminReportDownload(
  accessToken: string,
  reportId: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminReportDownload> {
  const parsedReportId = z.guid().safeParse(reportId.trim().toLowerCase());
  if (!parsedReportId.success) throw new AccountApiUnavailableError();
  const payload = await fetchAccountApiJson(
    `admin/reports/${encodeURIComponent(parsedReportId.data)}/download`,
    accessToken,
    options,
  );
  return parseAccountApiPayload(
    accountApiAdminReportDownloadSchema,
    payload,
    `admin/reports/${encodeURIComponent(parsedReportId.data)}/download`,
    "GET",
  );
}

export async function fetchAccountApiAccountLifecycle(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAccountLifecycle> {
  const payload = await fetchAccountApiJson("account/lifecycle", accessToken, options);
  return parseAccountApiPayload(
    accountApiAccountLifecycleSchema,
    payload,
    "account/lifecycle",
    "GET",
  );
}

export async function requestAccountApiAccountExport(
  accessToken: string,
  body: AccountApiAccountExportBody,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAccountExportRequest> {
  const payload = await postAccountApiJson(
    "account/exports/request",
    accessToken,
    {
      format: body.format,
      confirmation: body.confirmation,
      ...(body.expected_revision !== undefined
        ? { expected_revision: body.expected_revision }
        : {}),
    },
    options,
  );
  return parseAccountApiPayload(
    accountApiAccountExportRequestSchema,
    payload,
    "account/exports/request",
    "POST",
  );
}

export async function fetchAccountApiAccountExportDownload(
  accessToken: string,
  exportId: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAccountExportDownload> {
  const parsedExportId = z.guid().safeParse(exportId.trim().toLowerCase());
  if (!parsedExportId.success) throw new AccountApiUnavailableError();
  const payload = await fetchAccountApiJson(
    `account/exports/${encodeURIComponent(parsedExportId.data)}/download`,
    accessToken,
    options,
  );
  return parseAccountApiPayload(
    accountApiAccountExportDownloadSchema,
    payload,
    `account/exports/${encodeURIComponent(parsedExportId.data)}/download`,
    "GET",
  );
}

export async function requestAccountApiAccountDeletion(
  accessToken: string,
  body: AccountApiAccountDeletionBody,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAccountDeletionResult> {
  const payload = await postAccountApiJson(
    "account/deletion/request",
    accessToken,
    {
      confirmation: body.confirmation,
      ...(body.expected_revision !== undefined
        ? { expected_revision: body.expected_revision }
        : {}),
    },
    options,
  );
  return parseAccountApiPayload(
    accountApiAccountDeletionResultSchema,
    payload,
    "account/deletion/request",
    "POST",
  );
}

export async function cancelAccountApiAccountDeletion(
  accessToken: string,
  body: AccountApiAccountDeletionCancelBody,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAccountDeletionResult> {
  const parsedRequestId = z.guid().safeParse(body.request_id.trim().toLowerCase());
  if (!parsedRequestId.success) throw new AccountApiUnavailableError();
  const payload = await postAccountApiJson(
    "account/deletion/cancel",
    accessToken,
    {
      request_id: parsedRequestId.data,
      confirmation: body.confirmation,
      ...(body.expected_revision !== undefined
        ? { expected_revision: body.expected_revision }
        : {}),
    },
    options,
  );
  return parseAccountApiPayload(
    accountApiAccountDeletionResultSchema,
    payload,
    "account/deletion/cancel",
    "POST",
  );
}

export async function setAccountApiAdminUserActive(
  accessToken: string,
  userId: string,
  isActive: boolean,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminUserActivation> {
  const parsedUserId = z.guid().safeParse(userId.trim().toLowerCase());
  if (!parsedUserId.success) throw new AccountApiUnavailableError();
  const payload = await postAccountApiJson(
    `admin/users/${encodeURIComponent(parsedUserId.data)}/activation`,
    accessToken,
    { is_active: isActive },
    options,
  );
  return parseAccountApiPayload(
    accountApiAdminUserActivationSchema,
    payload,
    `admin/users/${encodeURIComponent(parsedUserId.data)}/activation`,
    "POST",
  );
}

/**
 * Assign a canonical role to another account. The API answers with the same projection
 * the activation route uses, so the caller can render the new role without a re-read.
 */
export async function setAccountApiAdminUserRole(
  accessToken: string,
  userId: string,
  role: AssignableRole,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminUserActivation> {
  const parsedUserId = z.guid().safeParse(userId.trim().toLowerCase());
  const parsedRole = z.enum(ASSIGNABLE_ROLES).safeParse(role);
  if (!parsedUserId.success || !parsedRole.success) throw new AccountApiUnavailableError();
  const route = `admin/users/${encodeURIComponent(parsedUserId.data)}/role`;
  const payload = await postAccountApiJson(route, accessToken, { role: parsedRole.data }, options);
  return parseAccountApiPayload(accountApiAdminUserActivationSchema, payload, route, "POST");
}

export async function revokeAccountApiAdminUserSession(
  accessToken: string,
  userId: string,
  sessionId: string,
  options: AccountApiFetchOptions & { idempotencyKey: string; reason?: string },
): Promise<AccountApiAdminUserSessionRevoke> {
  const parsedUserId = z.guid().safeParse(userId.trim().toLowerCase());
  const parsedSessionId = z.guid().safeParse(sessionId.trim().toLowerCase());
  if (!parsedUserId.success || !parsedSessionId.success) throw new AccountApiUnavailableError();
  const { reason = "admin-revoked", ...fetchOptions } = options;
  const payload = await postAccountApiJson(
    `admin/users/${encodeURIComponent(parsedUserId.data)}/sessions/${encodeURIComponent(parsedSessionId.data)}/revoke`,
    accessToken,
    { reason },
    fetchOptions,
  );
  return parseAccountApiPayload(
    accountApiAdminUserSessionRevokeSchema,
    payload,
    `admin/users/${encodeURIComponent(parsedUserId.data)}/sessions/${encodeURIComponent(parsedSessionId.data)}/revoke`,
    "POST",
  );
}

export async function fetchAccountApiNotifications(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiNotifications> {
  const payload = await fetchAccountApiJson("notifications", accessToken, options);
  return parseAccountApiPayload(accountApiNotificationsSchema, payload, "notifications", "GET");
}

export async function fetchAccountApiNotificationState(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiNotificationState> {
  const payload = await fetchAccountApiJson("notifications/state", accessToken, options);
  return parseAccountApiPayload(
    accountApiNotificationStateSchema,
    payload,
    "notifications/state",
    "GET",
  );
}

export async function recordAccountApiNotificationReceipt(
  accessToken: string,
  notificationId: string,
  status: AccountApiNotificationReceiptStatus,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiNotificationReceipt> {
  const parsedId = z
    .string()
    .min(6)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]{5,63}$/u)
    .safeParse(notificationId.trim().toLowerCase());
  if (!parsedId.success) throw new AccountApiUnavailableError();
  const payload = await postAccountApiJson(
    "notifications/receipts",
    accessToken,
    { notification_id: parsedId.data, status },
    options,
  );
  return parseAccountApiPayload(
    accountApiNotificationReceiptSchema,
    payload,
    "notifications/receipts",
    "POST",
  );
}

export async function fetchAccountApiAdminNotifications(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminNotifications> {
  const payload = await fetchAccountApiJson("admin/notifications", accessToken, options);
  return parseAccountApiPayload(
    accountApiAdminNotificationsSchema,
    payload,
    "admin/notifications",
    "GET",
  );
}

export async function updateAccountApiAdminNotifications(
  accessToken: string,
  body: Pick<AccountApiAdminNotifications, "notifications"> & { expected_revision?: string },
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminNotificationsUpdate> {
  const payload = await postAccountApiJson(
    "admin/notifications/update",
    accessToken,
    {
      notifications: body.notifications,
      ...(body.expected_revision !== undefined
        ? { expected_revision: body.expected_revision }
        : {}),
    },
    options,
  );
  return parseAccountApiPayload(
    accountApiAdminNotificationsUpdateSchema,
    payload,
    "admin/notifications/update",
    "POST",
  );
}

export async function fetchAccountApiAdminNotificationEmailQueue(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminNotificationEmailQueue> {
  const payload = await fetchAccountApiJson("admin/email", accessToken, options);
  return parseAccountApiPayload(
    accountApiAdminNotificationEmailQueueSchema,
    payload,
    "admin/email",
    "GET",
  );
}

export async function enqueueAccountApiAdminNotificationEmail(
  accessToken: string,
  body: {
    expected_revision?: string;
    subject: string;
    body: string;
    target: AccountApiAdminNotificationEmailQueue["jobs"][number]["target"];
    scheduled_at?: string;
  },
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminNotificationEmailEnqueue> {
  const payload = await postAccountApiJson(
    "admin/email/enqueue",
    accessToken,
    {
      subject: body.subject,
      body: body.body,
      target: body.target,
      scheduled_at: body.scheduled_at ?? "",
      ...(body.expected_revision !== undefined
        ? { expected_revision: body.expected_revision }
        : {}),
    },
    options,
  );
  return parseAccountApiPayload(
    accountApiAdminNotificationEmailEnqueueSchema,
    payload,
    "admin/email/enqueue",
    "POST",
  );
}
