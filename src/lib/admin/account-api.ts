import "server-only";

import { z } from "zod";

import { ASSIGNABLE_ROLES, type AssignableRole } from "@/lib/admin/role-labels";
import {
  ACCESS_DECISIONS,
  ACCESS_REASON_MAX,
  ACCESS_STATUSES,
  accessStatusOf,
  type AccessDecision,
  type AccessStatusValue,
} from "@/lib/admin/user-access";

export { ASSIGNABLE_ROLES, type AssignableRole };
// The vocabulary of access by application lives in a module the browser may import; it is
// re-exported here so server code has one place to import the client and its words from.
export {
  ACCESS_DECISIONS,
  ACCESS_REASON_MAX,
  ACCESS_STATUSES,
  accessStatusOf,
  type AccessDecision,
  type AccessStatusValue,
};
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
/**
 * Publishing a release, rolling one back, disabling one.
 *
 * Owner-only, and separated from reading release status for the same reason the two secret
 * capabilities are separated — only more so. Every other write in this console changes what
 * one account may do; this one changes what executable every installed desktop downloads,
 * and whether it installs without asking.
 */
export const RELEASE_PUBLISH_CAPABILITY = "releases:publish";
/**
 * The credentials the product spends — provider keys, market-data keys, map tokens — as
 * distinct from the account service's own settings (`CREDENTIAL_STATUS_CAPABILITY`).
 *
 * Reading and writing are separate on purpose. "Which key is failing?" is a question
 * someone must be able to answer at 2am; replacing one is not. Collapsing them would give
 * everyone who can answer the question the whole blast radius of the answer.
 */
export const SECRETS_READ_CAPABILITY = "secrets:read";
export const SECRETS_WRITE_CAPABILITY = "secrets:write";
/**
 * Changing what an account may do, as distinct from who they are. Deliberately separate
 * from role management: Support must be able to look at a plan without granting one, and
 * an Admin must be able to comp an account without being able to make someone an Owner.
 */
export const SUBSCRIPTION_WRITE_CAPABILITY = "subscription:write";
/** The audit event types every plan and override change is recorded under. */
export const SUBSCRIPTION_CHANGED_EVENT = "account.subscription_changed";
export const ENTITLEMENT_CHANGED_EVENT = "account.entitlement_changed";
/**
 * The support desk, split four ways because on a real desk these are four jobs.
 *
 * Reading is the queue; reading everything is somebody else's queue as well, which is a
 * manager's job and not an agent's — a conversation carries whatever the customer chose
 * to paste into it. Replying answers a customer. Managing moves work around without
 * answering anyone.
 */
export const SUPPORT_READ_CAPABILITY = "support:read";
export const SUPPORT_READ_ALL_CAPABILITY = "support:read-all";
export const SUPPORT_REPLY_CAPABILITY = "support:reply";
export const SUPPORT_MANAGE_CAPABILITY = "support:manage";
/** Granting somebody a staff role, as distinct from `roles:write` over every role. */
export const STAFF_WRITE_CAPABILITY = "staff:write";
/** The audit event types a member of the desk acting on a conversation is recorded under. */
export const SUPPORT_REPLIED_EVENT = "support.replied";
export const SUPPORT_MANAGED_EVENT = "support.managed";

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

// Derived, never retyped. A hand-written second copy of the role list is how a role the
// API started returning becomes a schema mismatch on `/me`, which fails every admin page
// at once rather than the one place that cares.
const roleSchema = z.enum(ASSIGNABLE_ROLES);
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
        // Access is by application: pending, approved or declined, read from the database the
        // way the access gate reads it. Optional so a console ahead of the service still reads
        // an older `me`; `.strict()` means it must be declared, or every `me` read fails.
        access_status: z.string().max(16).optional(),
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
    // Access is by application (migration 0077): pending, approved or declined. Optional so a
    // console deployed ahead of the service still reads an older profile; `.strict()` means it
    // has to be declared here, or every profile read fails the moment the service sends it.
    access_status: z.string().max(16).optional(),
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
    // Partial on purpose. The API sends a zero for every canonical role, but the console
    // and the account service deploy separately, and a console that refuses to render
    // because the service has not learned a role yet fails every admin page at once.
    counts_by_role: z.partialRecord(roleSchema, z.number().int().nonnegative()),
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
        // Access is by application: pending, approved or declined. Optional because a
        // service older than access-by-application does not send it; read it through
        // `accessStatusOf`, which treats anything else as pending, as the service does.
        access_status: z.string().max(16).optional(),
        created_at: z.string().max(64),
        last_login_at: z.string().max(64),
        updated_at: z.string().max(64),
      })
      .strict(),
    role: adminUserRoleSchema,
  })
  .strict();

// The latest decision on an application: who made it, when, and the reason they gave.
const adminAccessDecisionSchema = z
  .object({
    status: z.enum(ACCESS_STATUSES),
    decided_at: z.string().max(64).nullable(),
    decided_by: z.string().max(64).nullable(),
    reason: z.string().max(ACCESS_REASON_MAX),
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
        // The worker that builds an account's own data export. A separate switch from the
        // report worker above; a service older than the split does not send it.
        export_worker_enabled: z.boolean().optional(),
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

/**
 * A managed credential, described without being disclosed.
 *
 * Every field here answers a question an operator can act on — is it set, where does it
 * end up, which key is it, did the paste get truncated, when was it last known good. None
 * of them is derived from the credential in a way that can be run backwards: `fingerprint`
 * is a keyed digest the service computes and stores, and `prefix` is an allow-list lookup
 * of a published provider marker, never a slice of the value.
 *
 * The fields this shape deliberately has no room for are `value`, any suffix of one,
 * `credential_key_id` and `last_error`. `.strict()` is what enforces that: a service that
 * started sending any of them would fail the parse rather than quietly render them.
 */
const adminSecretVerificationSchema = z
  .object({
    state: z.enum([
      "valid",
      "rejected",
      "scoped-wrong",
      "no-quota",
      "inconclusive",
      "unclassified",
      "unverified",
      "unsupported",
      "checking",
    ]),
    // Empty or null until the key has been checked once.
    checked_at: z.string().max(64).nullable(),
  })
  .strict();

const adminSecretEntrySchema = z
  .object({
    fingerprint: z.string().min(1).max(64),
    prefix: z.string().max(32),
    length: z.number().int().nonnegative().max(100_000),
    position: z.number().int().nonnegative().max(64),
    // Both empty for a key the console did not write: it has no provenance to show.
    set_by: z.string().max(120),
    set_at: z.string().max(64),
    /** `console` for a key saved here, `outside` for one put in the store some other way. */
    origin: z.string().max(16).optional(),
    verification: adminSecretVerificationSchema,
  })
  .strict();

const adminSecretSlotSchema = z
  .object({
    slot: z.string().min(1).max(80),
    namespace: z.enum(["api", "geo"]),
    label: z.string().min(1).max(120),
    kind: z.enum(["single", "multi", "identifier"]),
    group: z.string().max(64).nullable(),
    hint: z.string().max(240),
    blast_radius: z.string().max(240),
    is_secret: z.boolean(),
    configured: z.boolean(),
    distribution: z.enum(["every-device", "server-only"]),
    distribution_certain: z.boolean(),
    entries: z.array(adminSecretEntrySchema).max(32),
  })
  .strict();

export const accountApiAdminSecretsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    store: z
      .object({
        // Three answers because they demand three different actions. "absent" is no
        // document at all in the account this service reads — expected on a new
        // deployment, and the signature of a misconfigured storage connection when
        // credentials were set from somewhere else.
        state: z.enum(["ready", "unreadable", "absent"]),
        dependency: z.string().max(120).nullable().optional(),
      })
      .strict(),
    slots: z.array(adminSecretSlotSchema).max(64),
  })
  .strict();

/** What a write answers with: the slot as it now stands, never the value that was sent. */
export const accountApiAdminSecretWriteSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    slot: adminSecretSlotSchema.nullable(),
    action: z.enum(["set", "append", "revoke", "restore"]),
    /**
     * The credential is committed and in use, but the description of it could not be
     * updated. Reporting that as a failure would send the operator round again to redo a
     * change that has already taken effect, so it is surfaced as a caveat instead.
     */
    metadata_lagging: z.boolean(),
    event: z
      .object({ id: z.string().max(64), event_type: z.string().max(64) })
      .strict()
      .nullable(),
    replayed: z.boolean(),
  })
  .strict();

/** A restore answers with the fingerprint it put back, and nothing else. */
export const accountApiAdminSecretRestoreSchema = accountApiAdminSecretWriteSchema;

// ------------------------------------------------------------------ the support desk
/**
 * A conversation as the desk sees it. `.strict()` is the boundary that matters most here:
 * the customer view and the staff view are two different projections upstream, and a
 * schema that quietly accepted extra fields would let a change on the service side start
 * rendering a customer's identifiers on a page that was never meant to carry them.
 */
const supportStatusSchema = z.enum(["open", "pending", "resolved"]);
const supportPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);

const supportMessageSchema = z
  .object({
    id: z.string().min(1).max(64),
    author: z.string().min(1).max(32),
    author_name: z.string().max(160),
    body: z.string().max(8_000),
    at: z.string().max(64),
  })
  .strict();

export const accountApiSupportSummarySchema = z
  .object({
    id: z.string().min(1).max(64),
    subject: z.string().max(240),
    status: supportStatusSchema,
    priority: supportPrioritySchema,
    created_at: z.string().max(64),
    updated_at: z.string().max(64),
    message_count: z.number().int().nonnegative(),
    last_author: z.string().max(32),
    last_at: z.string().max(64),
    account_id: z.string().max(64),
    /** The address the customer wrote from. A desk recognises a person, not a UUID. */
    account_email: z.string().max(320),
    assignee_id: z.string().max(64),
    assignee_name: z.string().max(160),
    unread: z.boolean(),
  })
  .strict();

export const accountApiSupportConversationSchema = z
  .object({
    id: z.string().min(1).max(64),
    subject: z.string().max(240),
    status: supportStatusSchema,
    priority: supportPrioritySchema,
    created_at: z.string().max(64),
    updated_at: z.string().max(64),
    messages: z.array(supportMessageSchema).max(500),
    account_id: z.string().max(64),
    account_email: z.string().max(320),
    assignee_id: z.string().max(64),
    assignee_name: z.string().max(160),
    app_version: z.string().max(64),
    platform: z.string().max(64),
    unread: z.boolean(),
  })
  .strict();

export const accountApiAdminSupportSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    conversations: z.array(accountApiSupportSummarySchema).max(500),
    unread: z.number().int().nonnegative(),
    // What this caller may do, decided upstream. The console renders the controls this
    // answer allows rather than offering an action the API will refuse.
    sees_all: z.boolean(),
    can_reply: z.boolean(),
    can_manage: z.boolean(),
    statuses: z.array(supportStatusSchema).max(8),
    priorities: z.array(supportPrioritySchema).max(8),
  })
  .strict();

export const accountApiAdminSupportConversationSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    conversation: accountApiSupportConversationSchema,
    replayed: z.boolean().optional(),
  })
  .strict();

// -------------------------------------------------------------------- access control
/**
 * Who is staff, and what each role permits.
 *
 * The capability lists arrive from the service rather than being described here. A console
 * that keeps its own copy of who-can-do-what drifts silently, and the direction it drifts
 * is always towards claiming more than is true.
 */
const staffMemberSchema = z
  .object({
    user_id: z.string().min(1).max(64),
    email: z.string().max(320),
    display_name: z.string().max(240),
    is_active: z.boolean(),
    role: roleSchema,
    capabilities: z.array(z.string().max(64)).max(64),
    mismatch: z.string().max(64),
    break_glass: z.boolean(),
    /** False when the account's profile row could not be read; the row is still named. */
    profile_readable: z.boolean(),
  })
  .strict();

const staffRoleCatalogueSchema = z
  .object({
    role: roleSchema,
    capabilities: z.array(z.string().max(64)).max(64),
    grantable: z.boolean(),
  })
  .strict();

export const accountApiAdminStaffSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    members: z.array(staffMemberSchema).max(500),
    roles: z.array(staffRoleCatalogueSchema).max(32),
    grantable_roles: z.array(roleSchema).max(32),
    can_grant: z.boolean(),
    can_assign_any_role: z.boolean(),
    legacy_readable: z.boolean(),
  })
  .strict();

export const accountApiAdminStaffWriteSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    member: staffMemberSchema,
    /** False when the account already held the role, so the trail counts changes. */
    changed: z.boolean(),
    event: z
      .object({ id: z.string().max(64), event_type: z.string().max(64) })
      .strict()
      .nullable(),
    replayed: z.boolean(),
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
        // `source-locked` said publishing happened at the deployment source and not here.
        // It does happen here now, so the value changed with the code rather than being
        // left to contradict the form beside it. Both spellings are accepted so a console
        // deployed ahead of the Account API still renders.
        status: z.enum(["source-locked", "console"]),
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
    access: adminAccessDecisionSchema.optional(),
  })
  .strict();

/**
 * The answer to approving or declining an application.
 *
 * A decision that changes nothing answers with the standing decision and `unchanged`, and
 * leaves out everything the write would have reported. A decline says how many sessions it
 * ended and, for an account that trades, what the kill switch did before they went.
 */
export const accountApiAdminUserAccessDecisionSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    user_id: z.guid(),
    access: adminAccessDecisionSchema,
    unchanged: z.boolean(),
    sessions_revoked: z.number().int().nonnegative().optional(),
    trading: z
      .object({
        trading_halted: z.boolean(),
        authorisations_revoked: z.number().int().nonnegative(),
        cancelled: z.number().int().nonnegative(),
        complete: z.boolean(),
      })
      .strict()
      .nullable()
      .optional(),
    decision_emailed: z.boolean().optional(),
    event: z
      .object({
        id: z.union([z.string().max(64), z.number().int()]).nullable(),
        event_type: z.string().max(64),
      })
      .strict()
      .nullable(),
    replayed: z.boolean().optional(),
  })
  .strict();

// --------------------------------------------------------------- subscriptions
// One entitlement as the API resolved it. A metered or counted feature carries numbers,
// a boolean feature carries `enabled`, and exactly one of the two is present for a given
// key — which is why the fields are optional here rather than a union of two objects the
// caller would have to narrow before it could read `source`.
const entitlementFeatureSchema = z
  .object({
    period: z.enum(["day", "month", "lifetime"]),
    source: z.string().min(1).max(16),
    /** `null` is unlimited, never zero. */
    limit: z.number().int().nonnegative().nullable().optional(),
    used: z.number().int().nonnegative().optional(),
    reserved: z.number().int().nonnegative().optional(),
    remaining: z.number().int().nonnegative().nullable().optional(),
    /** An absolute instant, so the client renders it in the reader's own timezone. */
    resets_at: z.string().min(1).max(64).optional(),
    period_key: z.string().min(1).max(64).optional(),
    enabled: z.boolean().optional(),
    reason: z.string().max(200).optional(),
  })
  .strict();

export const accountApiEntitlementsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    /**
     * The plan these allowances belong to. During a trial that is the trial's plan, not
     * the tier stored on the profile — the label and the numbers have to come from the
     * same place or the page reads "Included with Free" beside 1,000 AI chats.
     */
    plan: z.string().min(1).max(50),
    /** Sent only when it differs from `plan`: the tier the account drops back to. */
    stored_plan: z.string().min(1).max(50).optional(),
    /** The cache key: it moves on every entitlement change. */
    entitlement_version: z.number().int().nonnegative(),
    chat_model: z.string().min(1).max(64).optional(),
    /** The model deep research runs on for this plan; sent only when the plan has one. */
    research_model: z.string().min(1).max(64).optional(),
    generated_at: z.string().max(64),
    ttl_seconds: z.number().int().nonnegative(),
    /** Present only while a trial is live. */
    trial_ends_at: z.string().min(1).max(64).optional(),
    features: z.record(z.string().min(1).max(64), entitlementFeatureSchema),
  })
  .strict();

export const accountApiAdminSubscriptionsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    generated_at: z.string().min(1).max(64),
    /** Keys are raw stored tiers, not canonical plans; the console canonicalises them. */
    plans: metricCounterSchema,
    total_accounts: z.number().int().nonnegative(),
  })
  .strict();

const usageCounterSchema = z
  .object({
    feature_key: z.string().min(1).max(64),
    period_key: z.string().max(64),
    used: z.number().int().nonnegative(),
    reserved: z.number().int().nonnegative(),
    updated_at: z.string().max(64),
  })
  .strict();

export const accountApiAdminUserUsageSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    user_id: z.guid(),
    plan: z.string().min(1).max(50),
    generated_at: z.string().min(1).max(64),
    counters: z.array(usageCounterSchema).max(200),
  })
  .strict();

/** One account's resolved entitlements, read by an operator. Same shape as the account's
 *  own `me/entitlements`, plus the profile version a plan change compares against. */
export const accountApiAdminUserEntitlementsSchema = accountApiEntitlementsSchema
  .extend({
    user_id: z.guid(),
    profile_version: z.number().int().nonnegative(),
  })
  .strict();

const entitlementOverrideSchema = z
  .object({
    feature_key: z.string().min(1).max(64),
    source: z.string().max(16),
    source_ref: z.string().max(128),
    limit_value: z.number().int().nonnegative().nullable(),
    bool_value: z.boolean().nullable(),
    effective_from: z.string().max(64),
    effective_to: z.string().max(64),
    granted_by: z.string().max(64),
    reason: z.string().max(200),
  })
  .strict();

/** The receipt for a plan change or an override, in the house mutation envelope. */
export const accountApiAdminSubscriptionUpdateSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    user_id: z.guid(),
    plan: z.string().max(50),
    previous_plan: z.string().max(50),
    profile_version: z.number().int().nonnegative(),
    entitlement_version: z.number().int().nonnegative(),
    overrides: z.array(entitlementOverrideSchema).max(64),
    /**
     * The receipt for a trial: an instant means a window is open until then, an empty
     * string means there is none. The page says "with a 14-day trial" from this and never
     * from its own checkbox, so it can only say it about a trial that was written.
     */
    trial_ends_at: z.string().max(64),
    /**
     * The submitted plan was the one the account already had, with no trial to start or
     * end, so nothing was written. Bumping `entitlement_version` invalidates the cached
     * entitlement document on every device the account is signed in to, and filing an
     * audit event for a change that did not happen is worse than saying nothing.
     */
    unchanged: z.boolean(),
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

const accountDeletionHoldSchema = z
  .object({
    code: z.string().min(1).max(64),
    next_check_at: z.string().max(64),
    held_until: z.string().max(64),
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
        // `held` while the erasure waits for a broker to confirm cancellation; `incomplete`
        // when it went ahead without that confirmation (`brokers` step).
        z.enum([
          "pending",
          "source-locked",
          "retry",
          "complete",
          "failed",
          "skipped",
          "held",
          "incomplete",
        ]),
      )
      .refine((value) => Object.keys(value).length <= 16),
    attempts: z.number().int().nonnegative().max(100),
    max_attempts: z.number().int().positive().max(10),
    next_attempt_at: z.string().max(64),
    last_error: z.string().max(240),
    // What a due erasure is waiting for, as a code: `broker_cancellation` while a broker has
    // not confirmed every cancel. `held_until` is when it goes ahead regardless.
    hold: accountDeletionHoldSchema.nullable().default(null),
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

export const accountErasureStatementSchema = z
  .object({
    erased: z.string().min(1).max(2000),
    kept: z.array(z.string().min(1).max(1000)).max(20),
  })
  .strict();

export type AccountErasureStatement = z.infer<typeof accountErasureStatementSchema>;

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
    // What the erasure removes when the cooling-off period ends and what it keeps, in the
    // service's words (`erasure.ERASURE_STATEMENT`), so the confirmation can say exactly that.
    // Optional: a replay of a request stored before the service sent it carries none.
    erasure: accountErasureStatementSchema.optional(),
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
export type AccountApiAdminStaff = z.infer<typeof accountApiAdminStaffSchema>;
export type AccountApiAdminStaffWrite = z.infer<typeof accountApiAdminStaffWriteSchema>;
export type AccountApiStaffMember = z.infer<typeof staffMemberSchema>;
export type AccountApiStaffRoleCatalogue = z.infer<typeof staffRoleCatalogueSchema>;
export type AccountApiSupportSummary = z.infer<typeof accountApiSupportSummarySchema>;
export type AccountApiSupportConversation = z.infer<typeof accountApiSupportConversationSchema>;
export type AccountApiAdminSupport = z.infer<typeof accountApiAdminSupportSchema>;
export type AccountApiAdminSupportConversation = z.infer<
  typeof accountApiAdminSupportConversationSchema
>;
export type AccountApiSupportStatus = z.infer<typeof supportStatusSchema>;
export type AccountApiSupportPriority = z.infer<typeof supportPrioritySchema>;
export type AccountApiAdminSecrets = z.infer<typeof accountApiAdminSecretsSchema>;
export type AccountApiAdminSecretSlot = AccountApiAdminSecrets["slots"][number];
export type AccountApiAdminSecretEntry = AccountApiAdminSecretSlot["entries"][number];
export type AccountApiAdminSecretWrite = z.infer<typeof accountApiAdminSecretWriteSchema>;
export type AccountApiAdminSecretRestore = z.infer<typeof accountApiAdminSecretRestoreSchema>;
export type AccountApiEntitlements = z.infer<typeof accountApiEntitlementsSchema>;
export type AccountApiEntitlementFeature = z.infer<typeof entitlementFeatureSchema>;
export type AccountApiAdminSubscriptions = z.infer<typeof accountApiAdminSubscriptionsSchema>;
export type AccountApiAdminUserUsage = z.infer<typeof accountApiAdminUserUsageSchema>;
export type AccountApiAdminUserEntitlements = z.infer<typeof accountApiAdminUserEntitlementsSchema>;
export type AccountApiAdminSubscriptionUpdate = z.infer<
  typeof accountApiAdminSubscriptionUpdateSchema
>;
export type AccountApiEntitlementOverride = z.infer<typeof entitlementOverrideSchema>;
export type AccountApiAdminUsers = z.infer<typeof accountApiAdminUsersSchema>;
export type AccountApiAdminUserDetail = z.infer<typeof accountApiAdminUserDetailSchema>;
export type AccountApiAdminUserActivation = z.infer<typeof accountApiAdminUserActivationSchema>;
export type AccountApiAdminUserAccessDecision = z.infer<
  typeof accountApiAdminUserAccessDecisionSchema
>;
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
  /** The applications queue: only accounts whose access is in this state. */
  access?: AccessStatusValue | undefined;
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

export type AccountApiSubscriptionUpdateBody = {
  plan: string;
  /** Compare-and-swap against the target's profile; the API refuses a stale one. */
  expected_profile_version: number;
  trial_days?: number;
};

export type AccountApiEntitlementUpdateBody = {
  feature_key: string;
  /** `null` means unlimited. Omitted entirely for a boolean feature. */
  limit_value?: number | null;
  bool_value?: boolean;
  expires_in_days?: number;
  /** Required unless `remove` is true: a comp nobody can attribute is a revenue leak. */
  reason?: string;
  remove?: boolean;
};

/**
 * Mirrors PROFILE_UPDATE_ALLOWED_FIELDS in the Account API's `auth_routes.py`.
 *
 * Every key here is one the server accepts; anything else is refused with the field name, so
 * this type is the first of four gates a new field has to pass and the only one that fails at
 * compile time rather than at runtime.
 */
export type AccountApiProfileUpdateBody = {
  expected_profile_version: number;
  // identity
  first_name?: string;
  last_name?: string;
  phone?: string;
  country?: string;
  // who the holder is
  display_name?: string;
  occupation?: string;
  company?: string;
  bio?: string;
  website?: string;
  // what they follow, in the terminal's own vocabulary
  interests?: string;
  markets?: string;
  primary_workflow?: string;
  experience_level?: string;
  // how the terminal behaves
  timezone?: string;
  default_currency?: string;
  ui_density?: string;
  start_tab?: string;
  time_format?: string;
  show_market_times_in_local?: boolean;
  gain_colour?: string;
  change_display?: string;
  pulse_min_severity?: string;
  pulse_desktop_alerts?: boolean;
  research_ai_drafting?: boolean;
  // what reaches their inbox
  notify_price_alerts?: boolean;
  notify_portfolio_moves?: boolean;
  notify_news_digest?: boolean;
  notify_weekly_summary?: boolean;
  notify_research_complete?: boolean;
  notify_security_alerts?: boolean;
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

const HANDOFF_ID_PATTERN = /^[A-Za-z0-9_-]{32,128}$/u;

/** A browser→desktop sign-in request as the console may see it: never the challenge. */
export const accountApiHandoffSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    status: z.enum(["pending", "approved", "denied", "redeemed", "expired"]),
    user_code: z.string().min(1).max(16),
    device_name: z.string().max(120),
    client: z.string().max(16),
    intent: z.enum(["login", "signup"]),
    created_at: z.string().max(64),
    expires_at: z.string().max(64),
    approved_at: z.string().max(64).nullable(),
  })
  .strict();

export type AccountApiHandoff = z.infer<typeof accountApiHandoffSchema>;

function handoffRoute(handoffId: string, suffix = ""): string {
  const id = handoffId.trim();
  if (!HANDOFF_ID_PATTERN.test(id)) throw new AccountApiUnavailableError();
  return `auth/handoff/${encodeURIComponent(id)}${suffix}`;
}

/** The pending request the app opened this page for, for the signed-in visitor to judge. */
export async function fetchAccountApiHandoff(
  accessToken: string,
  handoffId: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiHandoff> {
  const route = handoffRoute(handoffId);
  const payload = await fetchAccountApiJson(route, accessToken, options);
  return parseAccountApiPayload(accountApiHandoffSchema, payload, route, "GET");
}

/** Binds the request to the visitor's account; the app's next poll signs it in. */
export async function approveAccountApiHandoff(
  accessToken: string,
  handoffId: string,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiHandoff> {
  const route = handoffRoute(handoffId, "/approve");
  const payload = await postAccountApiJson(route, accessToken, {}, options);
  return parseAccountApiPayload(accountApiHandoffSchema, payload, route, "POST");
}

/** "Not you?": cancels the request so the app stops waiting. */
export async function denyAccountApiHandoff(
  accessToken: string,
  handoffId: string,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiHandoff> {
  const route = handoffRoute(handoffId, "/deny");
  const payload = await postAccountApiJson(route, accessToken, {}, options);
  return parseAccountApiPayload(accountApiHandoffSchema, payload, route, "POST");
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

// ------------------------------------------------------------------------- portfolios
//
// A portfolio is the book a trade lands in. Nothing here is a secret, but the shapes are
// `.strict()` for the same reason everything else is: a field the service starts sending is
// a decision somebody should make here before it reaches a page.

export const portfolioSchema = z
  .object({
    id: z.string().max(64),
    name: z.string().max(80),
    base_currency: z.string().max(10),
    benchmark_symbol: z.string().max(20),
    starting_cash: z.number(),
    cash_balance: z.number(),
    is_paper: z.boolean(),
    is_default: z.boolean(),
    created_at: z.string().max(64).nullable(),
    updated_at: z.string().max(64).nullable(),
  })
  .strict();

export type AccountApiPortfolio = z.infer<typeof portfolioSchema>;

export const accountApiPortfoliosSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    portfolios: z.array(portfolioSchema).max(100),
    max_portfolios: z.number().int().positive(),
  })
  .strict();

export type AccountApiPortfolios = z.infer<typeof accountApiPortfoliosSchema>;

export async function fetchAccountApiPortfolios(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiPortfolios> {
  const payload = await fetchAccountApiJson("me/portfolios", accessToken, options);
  return parseAccountApiPayload(accountApiPortfoliosSchema, payload, "me/portfolios", "GET");
}

export async function createAccountApiPortfolio(
  accessToken: string,
  body: Readonly<Record<string, unknown>>,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<unknown> {
  return postAccountApiJson("me/portfolios/create", accessToken, body, options);
}

export async function updateAccountApiPortfolio(
  accessToken: string,
  portfolioId: string,
  body: Readonly<Record<string, unknown>>,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<unknown> {
  return postAccountApiJson(
    `me/portfolios/${encodeURIComponent(portfolioId)}/update`,
    accessToken,
    body,
    options,
  );
}

export async function deleteAccountApiPortfolio(
  accessToken: string,
  portfolioId: string,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<unknown> {
  return postAccountApiJson(
    `me/portfolios/${encodeURIComponent(portfolioId)}/delete`,
    accessToken,
    {},
    options,
  );
}

// The OVERNIGHT morning briefs the desktop files in the account (schema 1). The terminal
// formats every sentence and figure; these schemas mirror the service's own checks
// (`account_api/overnight_routes.py`) so a document the page cannot draw is refused here
// rather than rendered half. A source address is a link only when it is plain http(s).

const overnightText = (max: number) => z.string().max(max);
const overnightCount = z.number().int().min(0);
const overnightLink = z
  .string()
  .max(500)
  .refine((value) => value === "" || /^https?:\/\/[^/@\s]+(\/|$)/iu.test(value), {
    message: "an http(s) address or empty",
  });

const overnightItemSchema = z
  .object({
    rank: z.number().int().min(1).max(99),
    stage: z.enum(["idea", "research", "active", "closed", "rejected"]),
    verdict: z.enum(["BREACHED", "APPROACHING", "READ-ACROSS"]),
    why: overnightText(600),
    ticker: overnightText(24),
    name: overnightText(200),
    weight: overnightText(24),
    reach: overnightText(24),
    belief: z
      .object({
        text: overnightText(1000),
        rule: overnightText(300),
        recorded: overnightText(40),
        horizon: overnightText(40),
        version: overnightCount,
      })
      .strict(),
    lines: z
      .object({
        belief: overnightText(1200),
        landed: overnightText(800),
        hits: overnightText(1200),
        cost: overnightText(800),
        unbreak: overnightText(800),
        precedent: z.array(overnightText(800)).max(40),
      })
      .strict(),
    landed: z
      .object({
        value: overnightText(60),
        period: overnightText(60),
        judged: overnightText(60),
        judged_period: overnightText(60),
        published: overnightText(40),
        effective: overnightText(40),
        kind: overnightText(40),
        source: overnightText(200),
        url: overnightLink,
      })
      .strict()
      .nullable(),
    chain: z
      .object({
        cells: overnightCount,
        rows: z
          .array(
            z
              .object({
                row: overnightText(20),
                label: overnightText(200),
                period: overnightText(40),
                before: overnightText(60),
                after: overnightText(60),
                change: overnightText(24),
                landed: z.boolean(),
              })
              .strict(),
          )
          .max(80),
      })
      .strict(),
    scenarios: z
      .array(
        z
          .object({
            name: overnightText(40),
            target: overnightText(60),
            output: overnightText(200),
            change: overnightText(24),
            note: overnightText(400),
          })
          .strict(),
      )
      .max(2),
    unbreak: z
      .object({
        needed: overnightText(24),
        trailing: overnightText(24),
        cadence: overnightText(20),
        periods: overnightCount,
        observed: overnightCount,
        note: overnightText(800),
      })
      .strict()
      .nullable(),
    precedent: z
      .object({
        n: overnightCount,
        thin: z.boolean(),
        window: overnightText(60),
        spreads: z
          .array(
            z
              .object({
                horizon: overnightText(10),
                n: overnightCount,
                min: overnightText(24),
                p25: overnightText(24),
                median: overnightText(24),
                p75: overnightText(24),
                max: overnightText(24),
                clusters: overnightText(300),
              })
              .strict(),
          )
          .max(8),
        cases: z
          .array(
            z
              .object({
                label: overnightText(200),
                when: overnightText(40),
                move: overnightText(24),
              })
              .strict(),
          )
          .max(30),
      })
      .strict()
      .nullable(),
    notes: z.array(overnightText(800)).max(20),
    actions: z.array(overnightText(40)).max(8),
  })
  .strict();

const overnightDocumentSchema = z
  .object({
    issuer: overnightText(200),
    form: overnightText(40),
    title: overnightText(400),
    filed: overnightText(40),
    url: overnightLink,
    why: overnightText(2000),
    held: z.array(overnightText(800)).max(40),
  })
  .strict();

const overnightBlindSpotsSchema = z
  .object({
    teaser: overnightText(300),
    counts: z
      .object({
        unbelieved_variables: overnightCount,
        unthresholded_assumptions: overnightCount,
        stale_beliefs: overnightCount,
        no_thesis: overnightCount,
      })
      .strict(),
    total: overnightCount,
    rows_total: overnightCount,
    rows: z
      .array(
        z
          .object({
            section: z.enum([
              "unbelieved_variables",
              "unthresholded_assumptions",
              "stale_beliefs",
              "no_thesis",
            ]),
            label: overnightText(200),
            weight: overnightText(24),
            variable: overnightText(200),
            text: overnightText(800),
            arrivals: overnightCount,
            last_seen: overnightText(40),
          })
          .strict(),
      )
      .max(150),
  })
  .strict();

export const overnightBriefSchema = z
  .object({
    schema_version: z.literal(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    generated_at: overnightText(40),
    since: overnightText(40),
    count_line: overnightText(400),
    documents_seen: overnightCount,
    documents_moving: overnightCount,
    beliefs_held: overnightCount,
    items: z.array(overnightItemSchema).max(12),
    documents: z.array(overnightDocumentSchema).max(60),
    blind_spots: overnightBlindSpotsSchema.nullable(),
    attributions: z.array(overnightText(400)).max(20),
    notes: z.array(overnightText(800)).max(20),
  })
  .strict();

export type OvernightBrief = z.infer<typeof overnightBriefSchema>;
export type OvernightItem = z.infer<typeof overnightItemSchema>;
export type OvernightDocument = z.infer<typeof overnightDocumentSchema>;
export type OvernightBlindSpots = z.infer<typeof overnightBlindSpotsSchema>;

const overnightMorningSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    generated_at: z.string().max(64).nullable(),
    received_at: z.string().max(64).nullable(),
    count_line: overnightText(400),
    documents_seen: overnightCount,
    documents_moving: overnightCount,
    beliefs_held: overnightCount,
    blind_spots_total: overnightCount.nullable(),
  })
  .strict();

export type OvernightMorning = z.infer<typeof overnightMorningSchema>;

export const accountApiOvernightSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    mornings: z.array(overnightMorningSchema).max(60),
    keep: z.number().int().positive(),
  })
  .strict();

export type AccountApiOvernight = z.infer<typeof accountApiOvernightSchema>;

export const accountApiOvernightBriefSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    received_at: z.string().max(64).nullable(),
    brief: overnightBriefSchema,
  })
  .strict();

export type AccountApiOvernightBrief = z.infer<typeof accountApiOvernightBriefSchema>;

/** The account's mornings, newest first, without their documents. */
export async function fetchAccountApiOvernight(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiOvernight> {
  const payload = await fetchAccountApiJson("me/overnight", accessToken, options);
  return parseAccountApiPayload(accountApiOvernightSchema, payload, "me/overnight", "GET");
}

/** One morning's brief. A 404 means the account has none for that day. */
export async function fetchAccountApiOvernightBrief(
  accessToken: string,
  date: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiOvernightBrief> {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new AccountApiUnavailableError();
  const payload = await fetchAccountApiJson(
    `me/overnight/${encodeURIComponent(date)}`,
    accessToken,
    options,
  );
  return parseAccountApiPayload(
    accountApiOvernightBriefSchema,
    payload,
    "me/overnight/{brief_date}",
    "GET",
  );
}

// ------------------------------------------------------------------ broker connections
//
// The service never returns a credential, so neither does anything here. Each schema is
// `.strict()`, which is the enforcement: a field the API started sending — including one
// named `api_key` — fails the parse instead of reaching a component that might render it.

export const brokerConnectionSchema = z
  .object({
    id: z.string().max(64),
    broker: z.string().max(40),
    name: z.string().max(120),
    account_reference: z.string().max(120),
    paper: z.boolean(),
    is_active: z.boolean(),
    credential_fingerprint: z.string().max(32),
    credential_last_four: z.string().max(8),
    last_test_at: z.string().max(64).nullable(),
    last_test_success: z.boolean(),
    // The connection's own kill switch. `.strict()` means this has to be declared here the
    // moment the service starts sending it, or every broker read fails to parse.
    trading_enabled: z.boolean(),
    // Switched off by the account's kill switch and not yet resumed on its own (0079). Such a
    // connection stays off through a routine test until `trading/resume` names it. Defaults
    // to false so a console deployed ahead of the service still reads an older list.
    trading_halted: z.boolean().default(false),
    // Since when, and why: the halt that switched this connection off. The reason is only on
    // the list (`me/brokers`), not on a single connection a resume returns.
    halted_at: z.string().max(64).nullable().default(null),
    halt_reason: z.string().max(200).nullable().default(null),
    last_error: z.string().max(400),
    created_at: z.string().max(64).nullable(),
    updated_at: z.string().max(64).nullable(),
  })
  .strict();

export const accountApiBrokerConnectionsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    connections: z.array(brokerConnectionSchema).max(50),
    implemented_brokers: z.array(z.string().max(40)).max(50),
    encryption_configured: z.boolean(),
    // The account-level kill switch. A screen that showed each connection's flag and not this
    // would say "ready" for a connection no order can use.
    trading_halted: z.boolean().default(false),
    halted_at: z.string().max(64).nullable().default(null),
    // Why trading is off: "account deletion", "access declined", or what the person typed
    // when they pressed the kill switch. Null unless halted.
    halt_reason: z.string().max(200).nullable().default(null),
  })
  .strict();

export type AccountApiBrokerConnections = z.infer<typeof accountApiBrokerConnectionsSchema>;

export async function fetchAccountApiBrokerConnections(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiBrokerConnections> {
  const payload = await fetchAccountApiJson("me/brokers", accessToken, options);
  return parseAccountApiPayload(accountApiBrokerConnectionsSchema, payload, "me/brokers", "GET");
}

export async function createAccountApiBrokerConnection(
  accessToken: string,
  body: Readonly<Record<string, unknown>>,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<unknown> {
  // `me/brokers/create`, not `me/brokers`. The service registers the bare path as GET only,
  // so a POST to it is refused — and the mock used to accept both, which is exactly how this
  // shipped: every create in production answered "method not allowed" while the local check
  // passed. The mock now mirrors the real route table.
  return postAccountApiJson("me/brokers/create", accessToken, body, options);
}

export async function testAccountApiBrokerConnection(
  accessToken: string,
  connectionId: string,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<unknown> {
  return postAccountApiJson(
    `me/brokers/${encodeURIComponent(connectionId)}/test`,
    accessToken,
    {},
    options,
  );
}

export async function deleteAccountApiBrokerConnection(
  accessToken: string,
  connectionId: string,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<unknown> {
  // Expressed as a POST to an explicit `/delete` rather than an HTTP DELETE because
  // `fetchAccountApiJson` requires an Idempotency-Key on every body-carrying call, and a
  // delete that can be replayed safely is worth more here than method purity.
  return postAccountApiJson(
    `me/brokers/${encodeURIComponent(connectionId)}/delete`,
    accessToken,
    {},
    options,
  );
}

// ------------------------------------------------------------------ step-up
//
// A bearer token proves a session exists, not that a person is at the keyboard. The acts that
// stand for a person's judgement — turning trading back on, arming a standing authorisation,
// confirming a live order — need the account password entered again through `auth/step-up`,
// which mints a short-lived grant bound to this session and one purpose. The console asks for
// the password in the dialog that performs the act, spends the grant in the same server
// action, and never returns either to the browser.

export const STEP_UP_PURPOSES = ["confirm", "arm", "resume"] as const;
export type StepUpPurpose = (typeof STEP_UP_PURPOSES)[number];

export const accountApiStepUpSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    step_up: z
      .object({
        grant: z.string().min(1).max(128),
        purpose: z.enum(STEP_UP_PURPOSES),
        expires_at: z.string().min(1).max(64),
        single_use: z.boolean(),
        // A confirm grant is good for a few confirmations on one connection; arm and resume
        // grants for one act. Optional so the first shape of this answer still parses.
        max_uses: z.number().int().positive().max(100).optional(),
        connection_id: z.string().max(64).nullable().optional(),
      })
      .strict(),
  })
  .strict();

export type AccountApiStepUp = z.infer<typeof accountApiStepUpSchema>;

export async function requestAccountApiStepUp(
  accessToken: string,
  body: { password: string; purpose: StepUpPurpose },
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiStepUp> {
  const payload = await postAccountApiJson(
    "auth/step-up",
    accessToken,
    { password: body.password, purpose: body.purpose },
    options,
  );
  return parseAccountApiPayload(accountApiStepUpSchema, payload, "auth/step-up", "POST");
}

// ------------------------------------------------------------------ kill switch and resume

/** One order intent as `broker_routes._order_view` returns it: an allowlist of JSON types. */
export const brokerOrderIntentSchema = z
  .object({
    id: z.string().max(64),
    connection_id: z.string().max(64),
    client_order_id: z.string().max(80),
    symbol: z.string().max(40),
    side: z.string().max(16),
    quantity: z.number(),
    order_type: z.string().max(24),
    limit_price: z.number().nullable(),
    stop_price: z.number().nullable(),
    time_in_force: z.string().max(16),
    paper: z.boolean(),
    estimated_value: z.number().nullable(),
    state: z.string().max(32),
    broker_order_id: z.string().max(120),
    broker_message: z.string().max(400),
    submitted_at: z.string().max(64).nullable(),
    settled_at: z.string().max(64).nullable(),
    confirmation_basis: z.string().max(16),
    authorisation_id: z.string().max(64),
  })
  .strict();

/** What the kill switch recorded for one cancel, with the broker's answer in its own words. */
export const BROKER_CANCEL_OUTCOMES = [
  "cancel_requested",
  "already_cancelling",
  "refused",
  "unreachable",
] as const;
export type BrokerCancelOutcome = (typeof BROKER_CANCEL_OUTCOMES)[number];

export const brokerCancellationSchema = z
  .object({
    connection_id: z.string().max(64),
    broker_order_id: z.string().max(120),
    client_order_id: z.string().max(80),
    symbol: z.string().max(40),
    outcome: z.enum(BROKER_CANCEL_OUTCOMES),
    broker_status: z.string().max(40),
    broker_message: z.string().max(400),
    requested_at: z.string().max(64).nullable(),
    // False when the cancel was sent but its record could not be written: the order was
    // still asked to cancel, and the sweep says it cannot vouch for the record.
    recorded: z.boolean().optional(),
  })
  .strict();

export const brokerSweepConnectionSchema = z
  .object({
    connection_id: z.string().max(64),
    broker: z.string().max(40),
    paper: z.boolean(),
    trading_enabled: z.boolean(),
    working_orders: z.number().int().nonnegative(),
    cancels: z.array(brokerCancellationSchema).max(1000),
    record_failures: z
      .array(
        z
          .object({ broker_order_id: z.string().max(120), outcome: z.enum(BROKER_CANCEL_OUTCOMES) })
          .strict(),
      )
      .max(1000)
      .default([]),
    complete: z.boolean(),
    in_flight: z.array(brokerOrderIntentSchema).max(1000),
  })
  .strict();

/**
 * The kill switch's answer. Three shapes share it: the full sweep; a replay of that sweep for
 * a retried Idempotency-Key (`replayed`); and, for a second press while the first with that
 * key is still sweeping, only that the halt holds (`sweep_in_progress`, no counts).
 */
export const accountApiKillSwitchSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    trading_halted: z.boolean(),
    halted_at: z.string().max(64).nullable(),
    already_halted: z.boolean().optional(),
    connections_switched_off: z.number().int().nonnegative().optional(),
    authorisations_revoked: z.number().int().nonnegative().optional(),
    cancelled: z.number().int().nonnegative().optional(),
    in_flight: z.number().int().nonnegative().optional(),
    // False when the orders on their way to a broker could not be read, so the sweep cannot
    // vouch for them; `complete` is false with it.
    in_flight_known: z.boolean().optional(),
    complete: z.boolean(),
    connections: z.array(brokerSweepConnectionSchema).max(50).optional(),
    sweep_in_progress: z.boolean().optional(),
    replayed: z.boolean().optional(),
  })
  .strict();

export type AccountApiKillSwitch = z.infer<typeof accountApiKillSwitchSchema>;

export async function engageAccountApiKillSwitch(
  accessToken: string,
  body: { reason?: string },
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiKillSwitch> {
  // The service honours an Idempotency-Key here rather than requiring one: the halt comes
  // first whatever the body says. Each press sends its own key so a retried press replays
  // the first answer instead of sweeping twice.
  const payload = await postAccountApiJson(
    "me/brokers/kill-switch",
    accessToken,
    body.reason ? { reason: body.reason } : {},
    options,
  );
  return parseAccountApiPayload(
    accountApiKillSwitchSchema,
    payload,
    "me/brokers/kill-switch",
    "POST",
  );
}

export const accountApiTradingResumeSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    resumed: z.boolean(),
    // Null on success; otherwise why trading stayed off (`RESUME_REFUSED_*`). A string, not an
    // enum, so a refusal added later is shown by its message rather than failing the parse.
    reason: z.string().max(64).nullable().optional(),
    scope: z.enum(["connection", "account"]).optional(),
    // The connection test's own words: why trading did not come back, or the broker's "ok".
    message: z.string().max(4000).optional(),
    trading_halted: z.boolean(),
    connections_still_halted: z.number().int().nonnegative().optional(),
    connection: brokerConnectionSchema.optional(),
  })
  .strict();

export type AccountApiTradingResume = z.infer<typeof accountApiTradingResumeSchema>;

/** The resume refusals the console words for itself (`broker_routes.RESUME_REFUSED_*`). */
export const RESUME_REFUSED_BROKER_TEST = "broker_test_failed";
export const RESUME_REFUSED_KILL_SWITCH = "kill_switch_pressed_during_resume";

export type AccountApiTradingResumeBody =
  { connection_id: string; step_up: string } | { scope: "account"; step_up: string };

export async function resumeAccountApiTrading(
  accessToken: string,
  body: AccountApiTradingResumeBody,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiTradingResume> {
  const payload = await postAccountApiJson("me/brokers/trading/resume", accessToken, body, options);
  return parseAccountApiPayload(
    accountApiTradingResumeSchema,
    payload,
    "me/brokers/trading/resume",
    "POST",
  );
}

// ------------------------------------------------------------------ standing authorisations
//
// Read and revoked here; armed from the desktop app, which is where the strategy that sends
// under one runs. Arming takes a step-up of its own (`purpose: "arm"`), and the console has no
// order or strategy surface to arm one from.

export const BROKER_AUTHORISATION_STATES = ["active", "expired", "used", "revoked"] as const;

export const brokerAuthorisationSchema = z
  .object({
    id: z.string().max(64),
    connection_id: z.string().max(64),
    account: z.string().max(120),
    broker: z.string().max(40),
    strategy: z.string().max(120),
    max_order_value: z.number().nullable(),
    max_orders: z.number().int().nonnegative(),
    used_orders: z.number().int().nonnegative(),
    remaining: z.number().int().nonnegative(),
    expires_at: z.string().max(64).nullable(),
    created_at: z.string().max(64).nullable(),
    revoked_at: z.string().max(64).nullable(),
    revoke_reason: z.string().max(200),
    state: z.enum(BROKER_AUTHORISATION_STATES),
  })
  .strict();

export type BrokerAuthorisation = z.infer<typeof brokerAuthorisationSchema>;

export const accountApiBrokerAuthorisationsSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    authorisations: z.array(brokerAuthorisationSchema).max(50),
  })
  .strict();

export type AccountApiBrokerAuthorisations = z.infer<typeof accountApiBrokerAuthorisationsSchema>;

export const accountApiBrokerAuthorisationSchema = z
  .object({
    ok: z.literal(true),
    correlation_id: correlationSchema,
    authorisation: brokerAuthorisationSchema,
  })
  .strict();

export async function fetchAccountApiBrokerAuthorisations(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiBrokerAuthorisations> {
  const payload = await fetchAccountApiJson("me/brokers/authorisations", accessToken, options);
  return parseAccountApiPayload(
    accountApiBrokerAuthorisationsSchema,
    payload,
    "me/brokers/authorisations",
    "GET",
  );
}

export async function revokeAccountApiBrokerAuthorisation(
  accessToken: string,
  authorisationId: string,
  body: { reason?: string },
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<BrokerAuthorisation> {
  const payload = await postAccountApiJson(
    `me/brokers/authorisations/${encodeURIComponent(authorisationId)}/revoke`,
    accessToken,
    body.reason ? { reason: body.reason } : {},
    options,
  );
  return parseAccountApiPayload(
    accountApiBrokerAuthorisationSchema,
    payload,
    "me/brokers/authorisations/{authorisation_id}/revoke",
    "POST",
  ).authorisation;
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

/**
 * Slot names are catalogue identifiers, and the only ones this module will put into a
 * path. The names arrive in a response rather than from a person, but a name that reached
 * the URL unchecked would make the route builder a path-traversal primitive the moment the
 * upstream shape changed, so the check is here rather than assumed upstream.
 */
const SECRET_SLOT_PATTERN = /^[A-Za-z0-9_]{1,80}$/u;

function secretRoute(slot: string, suffix = ""): string {
  if (!SECRET_SLOT_PATTERN.test(slot)) throw new AccountApiUnavailableError();
  return `admin/secrets/${slot}${suffix}`;
}

/**
 * The managed credential inventory: metadata for every catalogue slot, no values.
 *
 * There is no companion "read one credential" call, in this module or upstream. That is
 * the design, not an omission.
 */
export async function fetchAccountApiAdminSecrets(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminSecrets> {
  const payload = await fetchAccountApiJson("admin/secrets", accessToken, options);
  return parseAccountApiPayload(accountApiAdminSecretsSchema, payload, "admin/secrets", "GET");
}

export type AccountApiAdminSecretWriteBody = {
  value: string;
  expected_fingerprint?: string;
  mode?: "replace" | "append";
};

export async function setAccountApiAdminSecret(
  accessToken: string,
  slot: string,
  body: AccountApiAdminSecretWriteBody,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminSecretWrite> {
  const route = secretRoute(slot);
  const payload = await postAccountApiJson(route, accessToken, body, options);
  return parseAccountApiPayload(accountApiAdminSecretWriteSchema, payload, route, "POST");
}

export async function revokeAccountApiAdminSecret(
  accessToken: string,
  slot: string,
  body: { expected_fingerprint?: string },
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminSecretWrite> {
  const route = secretRoute(slot, "/revoke");
  const payload = await postAccountApiJson(route, accessToken, body, options);
  return parseAccountApiPayload(accountApiAdminSecretWriteSchema, payload, route, "POST");
}

export async function restoreAccountApiAdminSecret(
  accessToken: string,
  slot: string,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminSecretRestore> {
  const route = secretRoute(slot, "/restore");
  const payload = await postAccountApiJson(route, accessToken, {}, options);
  return parseAccountApiPayload(accountApiAdminSecretRestoreSchema, payload, route, "POST");
}

/**
 * Conversation ids are minted by the service, not by a person, so they are matched on
 * shape rather than parsed: a segment that is not this shape is refused here instead of
 * being sent as a route the API would 404 anyway.
 */
const SUPPORT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;

function supportRoute(conversationId: string, suffix = ""): string {
  if (!SUPPORT_ID_PATTERN.test(conversationId)) throw new AccountApiUnavailableError();
  return `admin/support/${conversationId}${suffix}`;
}

/** The queue, already narrowed upstream to what this caller may read. */
/** The staff directory: everyone who is not a plain account, and what their role permits. */
export async function fetchAccountApiAdminStaff(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminStaff> {
  const payload = await fetchAccountApiJson("admin/staff", accessToken, options);
  return parseAccountApiPayload(accountApiAdminStaffSchema, payload, "admin/staff", "GET");
}

/**
 * Grant or remove a staff role.
 *
 * Owner and Admin are not sendable here: the service refuses them, and the type refuses
 * them first so the refusal is visible where the call is written rather than at run time.
 */
export async function setAccountApiAdminStaffRole(
  accessToken: string,
  userId: string,
  body: { role: AssignableRole; reason?: string },
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminStaffWrite> {
  const candidate = z.guid().safeParse(userId.trim().toLowerCase());
  if (!candidate.success) throw new AccountApiUnavailableError();
  const route = `admin/staff/${encodeURIComponent(candidate.data)}`;
  const payload = await postAccountApiJson(route, accessToken, body, options);
  return parseAccountApiPayload(accountApiAdminStaffWriteSchema, payload, route, "POST");
}

/** The staff roles the desk-staffing route may grant; Owner and Admin need `roles:write`. */
export const GRANTABLE_STAFF_ROLES = [
  "support_manager",
  "billing_manager",
  "auditor",
  "support",
  "user",
] as const satisfies readonly AssignableRole[];

export async function fetchAccountApiAdminSupport(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminSupport> {
  const payload = await fetchAccountApiJson("admin/support", accessToken, options);
  return parseAccountApiPayload(accountApiAdminSupportSchema, payload, "admin/support", "GET");
}

/** One conversation in full. Opening it is what marks it read, upstream. */
export async function fetchAccountApiAdminSupportConversation(
  accessToken: string,
  conversationId: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminSupportConversation> {
  const route = supportRoute(conversationId);
  const payload = await fetchAccountApiJson(route, accessToken, options);
  return parseAccountApiPayload(accountApiAdminSupportConversationSchema, payload, route, "GET");
}

export async function replyToAccountApiAdminSupport(
  accessToken: string,
  conversationId: string,
  body: { body: string },
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminSupportConversation> {
  const route = supportRoute(conversationId, "/reply");
  const payload = await postAccountApiJson(route, accessToken, body, options);
  return parseAccountApiPayload(accountApiAdminSupportConversationSchema, payload, route, "POST");
}

export type AccountApiAdminSupportManageBody = {
  assignee_id?: string;
  assignee_name?: string;
  status?: AccountApiSupportStatus;
  priority?: AccountApiSupportPriority;
};

export async function manageAccountApiAdminSupport(
  accessToken: string,
  conversationId: string,
  body: AccountApiAdminSupportManageBody,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminSupportConversation> {
  const route = supportRoute(conversationId, "/manage");
  const payload = await postAccountApiJson(route, accessToken, body, options);
  return parseAccountApiPayload(accountApiAdminSupportConversationSchema, payload, route, "POST");
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
  const { limit = 50, offset = 0, q, status, access, ...fetchOptions } = options;
  const query: Record<string, string> = {
    ...(fetchOptions.query ?? {}),
    limit: String(limit),
    offset: String(offset),
  };
  const text = (q ?? "").trim();
  if (text) query.q = text.slice(0, 120);
  if (status) query.status = status;
  if (access) query.access = access;
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
 * Approve or decline one account's application. The reason is required by the service and
 * kept with the decision; a decline also ends the account's sessions.
 */
export async function decideAccountApiAdminUserAccess(
  accessToken: string,
  userId: string,
  decision: { status: AccessDecision; reason: string },
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminUserAccessDecision> {
  const parsedUserId = z.guid().safeParse(userId.trim().toLowerCase());
  const parsedStatus = z.enum(ACCESS_DECISIONS).safeParse(decision.status);
  const reason = decision.reason.split(/\s+/u).filter(Boolean).join(" ");
  if (
    !parsedUserId.success ||
    !parsedStatus.success ||
    reason.length === 0 ||
    reason.length > ACCESS_REASON_MAX
  ) {
    throw new AccountApiUnavailableError();
  }
  const route = `admin/users/${encodeURIComponent(parsedUserId.data)}/access`;
  const payload = await postAccountApiJson(
    route,
    accessToken,
    { status: parsedStatus.data, reason },
    options,
  );
  return parseAccountApiPayload(accountApiAdminUserAccessDecisionSchema, payload, route, "POST");
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

/** What the signed-in caller may do, and how much of it is left. */
export async function fetchAccountApiEntitlements(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiEntitlements> {
  const payload = await fetchAccountApiJson("me/entitlements", accessToken, options);
  return parseAccountApiPayload(accountApiEntitlementsSchema, payload, "me/entitlements", "GET");
}

/** How many active accounts sit on each stored tier. */
export async function fetchAccountApiAdminSubscriptions(
  accessToken: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminSubscriptions> {
  const payload = await fetchAccountApiJson("admin/subscriptions", accessToken, options);
  return parseAccountApiPayload(
    accountApiAdminSubscriptionsSchema,
    payload,
    "admin/subscriptions",
    "GET",
  );
}

/** What one account has actually spent, for answering a support question. */
export async function fetchAccountApiAdminUserUsage(
  accessToken: string,
  userId: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminUserUsage> {
  const parsedUserId = z.guid().safeParse(userId.trim().toLowerCase());
  if (!parsedUserId.success) throw new AccountApiUnavailableError();
  const route = `admin/users/${encodeURIComponent(parsedUserId.data)}/usage`;
  const payload = await fetchAccountApiJson(route, accessToken, options);
  return parseAccountApiPayload(accountApiAdminUserUsageSchema, payload, route, "GET");
}

/**
 * One account's resolved entitlements, as that account's own device would see them.
 *
 * The alternative was mirroring the plan catalogue in the console so it could show what a
 * limit *would* be — a second source of truth that drifts the first time a plan changes
 * and nobody remembers the mirror exists. Resolving on the server means what an operator
 * sees is exactly what the user gets, overrides and trials included.
 */
export async function fetchAccountApiAdminUserEntitlements(
  accessToken: string,
  userId: string,
  options: AccountApiFetchOptions = {},
): Promise<AccountApiAdminUserEntitlements> {
  const parsedUserId = z.guid().safeParse(userId.trim().toLowerCase());
  if (!parsedUserId.success) throw new AccountApiUnavailableError();
  const route = `admin/users/${encodeURIComponent(parsedUserId.data)}/entitlements`;
  const payload = await fetchAccountApiJson(route, accessToken, options);
  return parseAccountApiPayload(accountApiAdminUserEntitlementsSchema, payload, route, "GET");
}

/** Move an account to a plan. The API refuses a caller changing their own. */
export async function setAccountApiAdminUserSubscription(
  accessToken: string,
  userId: string,
  body: AccountApiSubscriptionUpdateBody,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminSubscriptionUpdate> {
  const parsedUserId = z.guid().safeParse(userId.trim().toLowerCase());
  if (!parsedUserId.success) throw new AccountApiUnavailableError();
  const route = `admin/users/${encodeURIComponent(parsedUserId.data)}/subscription`;
  const payload = await postAccountApiJson(route, accessToken, body, options);
  return parseAccountApiPayload(accountApiAdminSubscriptionUpdateSchema, payload, route, "POST");
}

/** Raise, lower or remove one account's allowance for one feature. */
export async function setAccountApiAdminUserEntitlement(
  accessToken: string,
  userId: string,
  body: AccountApiEntitlementUpdateBody,
  options: AccountApiFetchOptions & { idempotencyKey: string },
): Promise<AccountApiAdminSubscriptionUpdate> {
  const parsedUserId = z.guid().safeParse(userId.trim().toLowerCase());
  if (!parsedUserId.success) throw new AccountApiUnavailableError();
  const route = `admin/users/${encodeURIComponent(parsedUserId.data)}/entitlement`;
  const payload = await postAccountApiJson(route, accessToken, body, options);
  return parseAccountApiPayload(accountApiAdminSubscriptionUpdateSchema, payload, route, "POST");
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
