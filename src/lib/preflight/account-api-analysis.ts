import type { AccountApiEvidence } from "@/lib/preflight/model";

/**
 * Structural analysis of the desktop Account API package.
 *
 * These are substring and shape checks over source the portal does not own, which makes
 * them weaker than the AST relationships used for portal code — they can show that a
 * reviewed construct is present, not that arbitrary other code is safe. They are still
 * worth gating on, because the properties they pin are exactly the ones that were wrong
 * in the legacy update function: wildcard CORS, an admin-only role comparison that
 * rejects Owner, untyped errors, and no correlation id anywhere.
 *
 * Every check fails closed. A missing file is not a pass.
 */
export type AccountApiSources = {
  functionApp: string | null;
  hostJson: string | null;
  requirements: string | null;
  infrastructure: string | null;
  modules: Readonly<Record<string, string | null>>;
};

/** The module inventory the package must keep. A merge back into one file fails this. */
export const ACCOUNT_API_MODULES = [
  "errors",
  "config",
  "capabilities",
  "http",
  "identity",
  "roles",
  "dto",
  "idempotency",
  "audit",
  "sessions",
  "notifications",
  "email_worker",
  "report_worker",
  "account_export_worker",
  "account_deletion_worker",
  "reports",
  "lifecycle",
  "support",
  "app",
  "gateways",
] as const;

/**
 * How much each of the booleans actually pins, classified in full rather than
 * partially. A reader deciding what a green gate is worth needs to know which checks
 * confirm a behaviour and which only confirm that a reviewed construct is present.
 *
 * Nothing here is evidence that the API works against a real project; that is stated in
 * `model.ts` and repeated in the check's own evidence line.
 */
export const FULLY_PINNED_PROPERTIES: readonly string[] = [
  // Module inventory plus "no Azure import in the pure core" — a rewrite cannot fake
  // either, and the second is what makes the package's offline tests possible at all.
  "modularPackage",
  // Parsed out of host.json, not matched as a string.
  "versionedRoutePrefix",
  // Every requirement line is matched against an exact-pin grammar.
  "pinnedRequirements",
];

/**
 * These confirm that a named construct exists in a named module. They reject the specific
 * defects the legacy update function carries — which is why they are worth gating on — but
 * a different implementation of the same mistake can satisfy them.
 */
export const CONSTRUCT_ONLY_PROPERTIES: readonly string[] = [
  // Compares source positions so the refusal must precede the mutation, and requires the
  // conditional-create primitive and the store lock to exist. Substrings cannot prove that
  // the reservation is actually atomic, which is why this is not filed as fully pinned.
  "idempotentMutations",
  // Requires the dispatcher's table-driven branch, not that every route is reachable only
  // through it.
  "unauthenticatedHealthRoute",
  "bearerAndActiveChecks",
  // Requires the canonical role constants and table-driven capability enforcement.
  "canonicalRoleMatrix",
  // Requires the safe-token check, the adapter's use of it, and request_id plumbing.
  "correlatedAudit",
  // Requires the code table and its payload builder.
  "typedErrors",
  // Requires source-only session lifecycle routes, owner filters and minimized DTOs.
  "sessionLifecycleRoutes",
  // Requires a read-only, aggregate-only admin metrics route with bounded source reads.
  "adminMetricsRoute",
  // Requires a read-only audit search route with bounded filters and safe summaries.
  "adminAuditExplorerRoute",
  // Requires caller-private report job routes with private download endpoints.
  "reportRoutes",
  // Requires caller-private export/deletion state routes with cooling-off and private downloads.
  "accountLifecycleRoutes",
  // Requires signed artifact downloads to be minted only after digest/size checks.
  "privateArtifactDownloads",
  // Requires the disabled-by-default report worker to write private report artifacts.
  "reportGenerationWorker",
  // Requires the disabled-by-default export worker to write encrypted private artifacts.
  "accountExportGenerationWorker",
  // Requires the disabled-by-default deletion worker to advance cooled-off cleanup safely.
  "accountDeletionCleanupWorker",
  // Requires user directory/detail routes with Support redaction, minimized DTOs and caps.
  "adminUsersRoute",
  // Requires the source-only activation route, idempotent profile patch and audit event.
  "adminUserActivationRoute",
  // Requires the source-only cross-user session revoke route, idempotency and audit.
  "adminUserSessionRevokeRoute",
  // Requires source-only notification targeting, admin authoring, receipts and safe links.
  "notificationRoutes",
  // Requires Owner-only source status for configuration, credentials and release locks.
  "ownerStatusRoutes",
  // Requires the four managed-credential route constants and both capability constants.
  // It cannot prove that no other route returns a credential value; it does reject the
  // shape where reading and writing share one capability, and the shape where the console
  // writes to a name the catalogue does not know.
  "managedSecretRoutes",
  // Requires the customer and desk route constants, the four capability constants, and
  // the module's own visibility and projection functions. It cannot prove that every
  // handler routes reads through `visible_to`; it does reject the shape where a customer
  // route takes the account from the request, and the shape where reading, answering and
  // running the queue share one capability.
  "supportDeskRoutes",
  // Requires the allow-list constant and the unknown-field rejection.
  "allowListedResponses",
  // Requires the discard branch for a wildcard origin and no wildcard literal in the CORS
  // builder; cannot prove the branch discards rather than accepts.
  "exactOriginCors",
  // Requires the registry merge, the blob-readability clause, and that mutating gateway
  // calls do not target either role store; cannot prove another module never writes one.
  "dualReadRolesWithoutCutover",
  // Requires the template's stated posture. ARM has never validated it and no deployment
  // has ever applied it.
  "safeStagingInfrastructure",
];

function includesAll(source: string | null | undefined, values: readonly string[]): boolean {
  if (!source) return false;
  return values.every((value) => source.includes(value));
}

function includesNone(source: string | null | undefined, values: readonly string[]): boolean {
  if (!source) return false;
  return values.every((value) => !source.includes(value));
}

function occursAtLeast(source: string | null | undefined, value: string, count: number): boolean {
  if (!source) return false;
  let found = 0;
  let offset = 0;
  while (offset >= 0) {
    const next = source.indexOf(value, offset);
    if (next < 0) break;
    found += 1;
    offset = next + value.length;
  }
  return found >= count;
}

/**
 * The idempotency key must be reserved before the mutation, not recorded after it.
 *
 * Position matters here in a way a substring cannot express, so the write call sites are
 * located and compared.
 */
function reservesBeforeMutating(source: string | null | undefined): boolean {
  if (!source) return false;
  const helperReserve = source.indexOf("replayed = replay_or_reserve(");
  const helperMutate = source.indexOf("payload, status = operation()");
  const helperFinish = source.indexOf("complete(deps.idempotency", helperMutate);
  const auditReserve = source.indexOf("replayed = replay_or_reserve(", helperFinish);
  const auditMutate = source.indexOf("event_id = deps.audit.record_auth_event(event)");
  const auditFinish = source.indexOf("complete(deps.idempotency", auditMutate);
  const reportReserve = source.indexOf("replayed = replay_or_reserve(", auditFinish);
  const reportMutate = source.indexOf(
    "deps.gateway.write_admin_report_queue_document(document)",
    reportReserve,
  );
  const reportFinish = source.indexOf("complete(deps.idempotency", reportMutate);
  const accountExportReserve = source.indexOf("replayed = replay_or_reserve(", reportFinish);
  const accountExportMutate = source.indexOf(
    "deps.gateway.write_account_lifecycle_document(document)",
    accountExportReserve,
  );
  const accountExportFinish = source.indexOf("complete(deps.idempotency", accountExportMutate);
  const accountDeletionReserve = source.indexOf(
    "replayed = replay_or_reserve(",
    accountExportFinish,
  );
  const accountDeletionMutate = source.indexOf(
    "deps.gateway.write_account_lifecycle_document(document)",
    accountExportMutate + 1,
  );
  const accountDeletionFinish = source.indexOf("complete(deps.idempotency", accountDeletionMutate);
  const accountDeletionCancelReserve = source.indexOf(
    "replayed = replay_or_reserve(",
    accountDeletionFinish,
  );
  const accountDeletionCancelMutate = source.indexOf(
    "deps.gateway.write_account_lifecycle_document(document)",
    accountDeletionMutate + 1,
  );
  const accountDeletionCancelFinish = source.indexOf(
    "complete(deps.idempotency",
    accountDeletionCancelMutate,
  );
  const activationReserve = source.indexOf(
    "replayed = replay_or_reserve(",
    accountDeletionCancelFinish,
  );
  const activationMutate = source.indexOf("updated = deps.gateway.set_admin_user_active");
  const activationFinish = source.indexOf("complete(deps.idempotency", activationMutate);
  const roleReserve = source.indexOf("replayed = replay_or_reserve(", activationFinish);
  const roleMutate = source.indexOf("stored_role = deps.gateway.set_database_role");
  const roleFinish = source.indexOf("complete(deps.idempotency", roleMutate);
  const adminSessionReserve = source.indexOf("replayed = replay_or_reserve(", roleFinish);
  const adminSessionMutate = source.indexOf("revoked = deps.gateway.revoke_account_session");
  const adminSessionFinish = source.indexOf("complete(deps.idempotency", adminSessionMutate);
  const notificationUpdateReserve = source.indexOf(
    "replayed = replay_or_reserve(",
    adminSessionFinish,
  );
  const notificationUpdateMutate = source.indexOf(
    "deps.gateway.write_notification_document(document)",
  );
  const notificationUpdateFinish = source.indexOf(
    "complete(deps.idempotency",
    notificationUpdateMutate,
  );
  const notificationEmailReserve = source.indexOf(
    "replayed = replay_or_reserve(",
    notificationUpdateFinish,
  );
  const notificationEmailMutate = source.indexOf(
    "deps.gateway.write_notification_email_queue_document(document)",
    notificationEmailReserve,
  );
  const notificationEmailFinish = source.indexOf(
    "complete(deps.idempotency",
    notificationEmailMutate,
  );
  const notificationEmailOutcomeReserve = source.indexOf(
    "replayed = replay_or_reserve(",
    notificationEmailFinish,
  );
  const notificationEmailOutcomeMutate = source.indexOf(
    "deps.gateway.write_notification_email_queue_document(document)",
    notificationEmailMutate + 1,
  );
  const notificationEmailOutcomeFinish = source.indexOf(
    "complete(deps.idempotency",
    notificationEmailOutcomeMutate,
  );
  const notificationReceiptReserve = source.indexOf(
    "replayed = replay_or_reserve(",
    notificationEmailOutcomeFinish,
  );
  const notificationReceiptMutate = source.indexOf(
    "event_id = deps.audit.record_auth_event(event)",
    notificationReceiptReserve,
  );
  const notificationReceiptFinish = source.indexOf(
    "complete(deps.idempotency",
    notificationReceiptMutate,
  );
  return (
    helperReserve >= 0 &&
    helperMutate > helperReserve &&
    helperFinish > helperMutate &&
    auditReserve > helperFinish &&
    auditMutate > auditReserve &&
    auditFinish > auditMutate &&
    reportReserve > auditFinish &&
    reportMutate > reportReserve &&
    reportFinish > reportMutate &&
    accountExportReserve > reportFinish &&
    accountExportMutate > accountExportReserve &&
    accountExportFinish > accountExportMutate &&
    accountDeletionReserve > accountExportFinish &&
    accountDeletionMutate > accountDeletionReserve &&
    accountDeletionFinish > accountDeletionMutate &&
    accountDeletionCancelReserve > accountDeletionFinish &&
    accountDeletionCancelMutate > accountDeletionCancelReserve &&
    accountDeletionCancelFinish > accountDeletionCancelMutate &&
    activationReserve > accountDeletionCancelFinish &&
    activationMutate > activationReserve &&
    activationFinish > activationMutate &&
    roleReserve > activationFinish &&
    roleMutate > roleReserve &&
    roleFinish > roleMutate &&
    adminSessionReserve > roleFinish &&
    adminSessionMutate > adminSessionReserve &&
    adminSessionFinish > adminSessionMutate &&
    notificationUpdateReserve > adminSessionFinish &&
    notificationUpdateMutate > notificationUpdateReserve &&
    notificationUpdateFinish > notificationUpdateMutate &&
    notificationEmailReserve > notificationUpdateFinish &&
    notificationEmailMutate > notificationEmailReserve &&
    notificationEmailFinish > notificationEmailMutate &&
    notificationEmailOutcomeReserve > notificationEmailFinish &&
    notificationEmailOutcomeMutate > notificationEmailOutcomeReserve &&
    notificationEmailOutcomeFinish > notificationEmailOutcomeMutate &&
    notificationReceiptReserve > notificationEmailOutcomeFinish &&
    notificationReceiptMutate > notificationReceiptReserve &&
    notificationReceiptFinish > notificationReceiptMutate
  );
}

function mutatingGatewayRoleWrites(source: string | null | undefined): boolean {
  if (!source) return true;
  const writes = source.matchAll(/"(?:POST|PATCH|PUT|DELETE)",\s*\n\s*"([^"]+)"/g);
  for (const match of writes) {
    const path = match[1] ?? "";
    if (/app_roles|admin_roles/i.test(path)) return true;
  }
  return false;
}

function parsedHostJson(source: string | null): unknown {
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

function routePrefix(source: string | null): string | null {
  const parsed = parsedHostJson(source);
  if (!parsed || typeof parsed !== "object") return null;
  const extensions = (parsed as { extensions?: unknown }).extensions;
  if (!extensions || typeof extensions !== "object") return null;
  const http = (extensions as { http?: unknown }).http;
  if (!http || typeof http !== "object") return null;
  const prefix = (http as { routePrefix?: unknown }).routePrefix;
  return typeof prefix === "string" ? prefix : null;
}

function requirementsArePinned(source: string | null): boolean {
  if (!source) return false;
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  if (lines.length === 0) return false;
  return lines.every((line) => {
    const requirement = line.split(/\s+#/, 1)[0]?.trim() ?? "";
    return /^[A-Za-z0-9_.-]+(?:\[[^\]]+\])?==[^<>=~^*\s]+(?:\s*;.*)?$/.test(requirement);
  });
}

function infrastructureIsSafe(source: string | null): boolean {
  if (!source) return false;
  const required = [
    "@secure()",
    "httpsOnly: true",
    "minTlsVersion: '1.2'",
    "allowBlobPublicAccess: false",
    "publicAccess: 'None'",
    "qt-account-private-artifacts",
    "ftpsState: 'Disabled'",
    // The in-memory idempotency store is only correct on one instance, and this is the
    // only place that precondition can be enforced rather than merely described.
    "functionAppScaleLimit: 1",
  ];
  if (!includesAll(source, required)) return false;

  // A secret readable from a deployment is a secret in a log. The obvious form names the
  // parameter; the dangerous form emits a collection that contains it.
  const leakingOutput = source
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("output "))
    .some((line) => /servicerolekey|appsettings|siteconfig|listkeys/i.test(line));
  return !leakingOutput;
}

export function analyzeAccountApi(sources: AccountApiSources): AccountApiEvidence | null {
  const missingModule = ACCOUNT_API_MODULES.some((name) => !sources.modules[name]);
  if (!sources.functionApp || !sources.hostJson || missingModule) return null;

  const adapter = sources.functionApp;
  const modules = sources.modules;

  return {
    // The adapter converts transport and delegates. An authorization decision written
    // there would be one the package's offline tests cannot reach.
    modularPackage:
      !missingModule &&
      includesAll(adapter, ["handle(request"]) &&
      includesNone(adapter, ["app_roles", "capabilities_for", "resolve_role"]) &&
      // The pure core must not import the Azure SDK, or none of it is testable offline.
      ACCOUNT_API_MODULES.filter((name) => name !== "gateways").every((name) =>
        includesNone(modules[name] ?? null, ["import azure", "from azure"]),
      ),
    versionedRoutePrefix: routePrefix(sources.hostJson) === "api/v1",
    unauthenticatedHealthRoute:
      includesAll(modules.app, [
        'HEALTH_ROUTE = "health"',
        "unauthenticated_routes",
        // Derived from the dispatch table rather than hand-maintained, so the declared
        // anonymous set cannot drift from the enforced one.
        "if not entry.requires_authentication",
      ]) && includesAll(modules.app, ['RouteEntry("GET", False, None, anonymous=_health)']),
    // No wildcard branch anywhere: not in the CORS builder, not in the platform config.
    exactOriginCors:
      includesAll(modules.http, ["config.allowed_origins", "Access-Control-Allow-Origin"]) &&
      // No wildcard literal in the CORS builder at all.
      includesNone(modules.http, ['"*"', "'*'"]) &&
      // And a wildcard in configuration is discarded rather than honoured.
      includesAll(modules.config, ['origin == "*"']) &&
      // The platform layer stays empty so there is one CORS authority, not two.
      includesAll(sources.infrastructure, ["allowedOrigins: []"]),
    bearerAndActiveChecks:
      includesAll(modules.identity, [
        "resolve_token",
        "read_active_flag",
        "ACCOUNT_INACTIVE",
        // An unreadable flag refuses without claiming the account was deactivated.
        "UNREADABLE",
      ]) &&
      // And authentication is applied by the dispatcher from its own table, so a route
      // cannot be anonymous merely by omitting a call.
      includesAll(modules.app, [
        "requires_authentication",
        "resolve_caller(request, deps.gateway)",
        "if not entry.requires_authentication",
      ]),
    // Owner is administrative here, unlike the legacy function's `role != "admin"`.
    canonicalRoleMatrix:
      includesAll(modules.capabilities, [
        'OWNER = "owner"',
        'ADMIN = "admin"',
        'SUPPORT = "support"',
        'USER = "user"',
        "CANONICAL_ROLES",
      ]) &&
      // Capability enforcement lives in the dispatcher, driven by the route table, so no
      // handler carries its own role comparison.
      includesAll(modules.app, ["has_capability", "entry.capability", "required_capabilities"]),
    correlatedAudit:
      includesAll(modules.http, ["CORRELATION_HEADER", "_SAFE_TOKEN.match"]) &&
      includesAll(modules.audit, ["request_id"]) &&
      includesAll(modules.app, ["request_id=correlation"]) &&
      // The adapter must resolve the id through the same validation, including on its
      // unhandled-error path: that is the one branch where a log line is the only record,
      // and reading the raw header there would put attacker-chosen text into it.
      includesAll(adapter, ["correlation_id(request)"]) &&
      includesNone(adapter, ['request.header("x-correlation-id")']),
    typedErrors:
      includesAll(modules.errors, ["_STATUS_BY_CODE", "_MESSAGE_BY_CODE", "def to_payload"]) &&
      includesAll(modules.app, ["ApiError"]),
    idempotentMutations:
      includesAll(modules.idempotency, [
        "IDEMPOTENCY_KEY_CONFLICT",
        "request_digest",
        "def replay_or_reserve",
        // Reservations are per caller as well as per route, and they expire.
        "def scope_for",
        "ttl_seconds",
        // The claim is a conditional create under a lock, with expiry resolved inside the
        // same atomic step. A read-then-write, or an expiry handled by the caller, is the
        // race this exists to remove.
        "def reserve",
        "def remove",
        "threading.Lock",
        // A release must never delete a completed outcome: retries of one request share a
        // digest, so the digest alone cannot tell two attempts apart.
        "existing.reserved",
        // A reservation lease and a replay window are separate lifetimes.
        "lease_seconds",
      ]) &&
      // Every mutating route claims the key first: the desktop app-state upsert, the two
      // subscription writes the console drives, the three credential writes, and the four
      // support sends. The floor is the current count, not a comfortable margin below it,
      // which is the point — a route added without a key drops the property instead of
      // hiding under the slack.
      occursAtLeast(modules.app, "require_key(request)", 23) &&
      includesAll(modules.app, ["replay_or_reserve", "scope_for("]) &&
      // The reservation must precede the side effect. Recording afterwards misses the case
      // the module exists for: a request killed between the write and the record.
      reservesBeforeMutating(modules.app),
    supportDeskRoutes:
      includesAll(modules.app, [
        'SUPPORT_CONVERSATIONS_ROUTE = "support/conversations"',
        'SUPPORT_CONVERSATION_OPEN_ROUTE = "support/conversations/open"',
        'ADMIN_SUPPORT_ROUTE = "admin/support"',
        'ADMIN_SUPPORT_REPLY_ROUTE = "admin/support/{conversation_id}/reply"',
        'ADMIN_SUPPORT_MANAGE_ROUTE = "admin/support/{conversation_id}/manage"',
        "def _support_conversation_id",
        // A customer route takes the account from the resolved caller, never from the
        // request: there is no parameter that could widen it.
        "account_id=caller.user_id",
        // The desk's breadth is the caller's capability, not a flag the request sends.
        "read_all=has_capability(resolution.effective_role, READ_ALL_SUPPORT)",
      ]) &&
      includesAll(modules.capabilities, [
        'READ_SUPPORT = "support:read"',
        'READ_ALL_SUPPORT = "support:read-all"',
        'REPLY_SUPPORT = "support:reply"',
        'MANAGE_SUPPORT = "support:manage"',
      ]) &&
      includesAll(modules.support, [
        // The refusal the whole design rests on, and the projection that keeps one
        // customer's identifiers out of another reader's page.
        "def visible_to",
        "def conversation_view",
        "def summary_view",
        "read_all",
      ]),
    allowListedResponses:
      includesAll(modules.dto, ["AUDIT_EVENT_ALLOWED_FIELDS", "def caller_dto"]) &&
      includesAll(modules.app, ["AUDIT_EVENT_ALLOWED_FIELDS", "unknown_fields"]),
    sessionLifecycleRoutes:
      includesAll(modules.app, [
        'SESSIONS_ROUTE = "sessions"',
        'SESSION_REGISTER_ROUTE = "sessions/register"',
        'SESSION_HEARTBEAT_ROUTE = "sessions/heartbeat"',
        'SESSION_END_ROUTE = "sessions/end"',
        'SESSION_REVOKE_ROUTE = "sessions/revoke"',
        'ACTIVITY_ROUTE = "activity"',
        "_assert_caller_session_not_revoked",
        "SESSION_REVOKED",
        "require_provider_session_id(caller.provider_session_id)",
      ]) &&
      includesAll(modules.sessions, [
        "SESSION_SELECT_COLUMNS",
        "ACTIVITY_SELECT_COLUMNS",
        "REGISTER_ALLOWED_FIELDS",
        "HEARTBEAT_ALLOWED_FIELDS",
        "REVOKE_ALLOWED_FIELDS",
        "def session_dto",
        "def activity_dto",
      ]) &&
      includesAll(modules.gateways, [
        "FROM dbo.account_sessions WHERE user_id = %s ",
        "ORDER BY last_seen_at DESC OFFSET 0 ROWS FETCH NEXT %s ROWS ONLY",
        "WHERE user_id = %s AND provider = %s AND provider_session_id = %s",
        "FROM dbo.auth_events WHERE user_id = %s ",
        "ORDER BY occurred_at DESC OFFSET 0 ROWS FETCH NEXT %s ROWS ONLY",
        "INSERT INTO dbo.auth_events",
      ]),
    adminMetricsRoute:
      includesAll(modules.app, [
        'ADMIN_METRICS_ROUTE = "admin/metrics"',
        "READ_ANY_ACCOUNT",
        "def _admin_metrics",
        "read_admin_metrics",
        "admin_metrics_dto",
      ]) &&
      includesAll(modules.dto, [
        "def admin_metrics_dto",
        '"accounts"',
        '"sessions"',
        '"auth_events_24h"',
        '"limits"',
        "accounts_truncated",
      ]) &&
      includesAll(modules.gateways, [
        "ADMIN_METRICS_ROW_LIMIT = 10000",
        "def read_admin_metrics",
        "FROM dbo.account_sessions ORDER BY last_seen_at DESC",
        "FROM dbo.auth_events WHERE occurred_at >= %s ORDER BY occurred_at DESC",
        "GROUP BY CAST(occurred_at AS date), outcome",
      ]),
    adminAuditExplorerRoute:
      includesAll(modules.app, [
        'ADMIN_AUDIT_EVENTS_ROUTE = "admin/audit-events/search"',
        "READ_AUDIT_EVENTS",
        "def _admin_audit_events",
        "def _admin_audit_filters",
        "read_admin_audit_events",
        "viewer_role=resolution.effective_role",
      ]) &&
      includesAll(modules.dto, [
        "def admin_audit_event_dto",
        "def admin_audit_events_dto",
        '"summary"',
        '"actor_role"',
        "None if support",
      ]) &&
      includesAll(modules.audit, [
        "ADMIN_AUDIT_SELECT_COLUMNS",
        "class AuditEventRecord",
        "def clean_event_type_filter",
        "def clean_request_id_filter",
      ]) &&
      includesAll(modules.gateways, [
        "def read_admin_audit_events",
        "FROM dbo.auth_events AS e ",
        "ORDER BY occurred_at DESC, id ASC",
        "metadata",
      ]) &&
      includesAll(modules.capabilities, ['READ_AUDIT_EVENTS = "audit:read"']),
    adminUsersRoute:
      includesAll(modules.app, [
        'ADMIN_USERS_ROUTE = "admin/users"',
        'ADMIN_USER_DETAIL_ROUTE = "admin/users/{user_id}"',
        "def _admin_users",
        "def _admin_user_detail",
        "read_admin_user_profiles",
        "read_admin_user_profile",
        "ADMIN_USER_DETAIL_SESSION_LIMIT = 10",
        "ADMIN_USER_DETAIL_ACTIVITY_LIMIT = 20",
        "READ_ANY_ACCOUNT",
        "viewer_role=resolution.effective_role",
      ]) &&
      includesAll(modules.dto, [
        "def admin_user_dto",
        "def admin_users_dto",
        "def admin_user_detail_dto",
        "SUPPORT_REDACTED_TEXT",
        "def _support_redacted",
        "def _admin_session_projection",
        "viewer_role",
        '"display_name"',
        '"subscription_tier"',
        '"sessions"',
        '"activity"',
      ]) &&
      includesAll(modules.gateways, [
        "def read_admin_user_profiles",
        "def read_admin_user_profile",
        "def _admin_user_filter",
        "FROM dbo.app_profiles",
        "ORDER BY created_at DESC, user_id ASC",
        "OFFSET %s ROWS FETCH NEXT %s ROWS ONLY",
      ]),
    adminUserActivationRoute:
      includesAll(modules.app, [
        'ADMIN_USER_ACTIVATION_ROUTE = "admin/users/{user_id}/activation"',
        "ADMIN_USER_ACTIVATION_ALLOWED_FIELDS",
        "MANAGE_USER_ACTIVATION",
        "def _admin_user_activation",
        "set_admin_user_active",
        "cannot deactivate self",
        "target_role",
        "account.activated",
        "account.deactivated",
        // Role assignment shares the activation contract: same DTO, same idempotency
        // shape, same audit path, plus the self-change and pinned-target refusals.
        'ADMIN_USER_ROLE_ROUTE = "admin/users/{user_id}/role"',
        "ADMIN_USER_ROLE_ALLOWED_FIELDS",
        "MANAGE_ROLES",
        "def _admin_user_role",
        "def _can_change_role",
        "set_database_role",
        "cannot change own role",
        "break-glass owner is pinned by configuration",
        "account.role_changed",
      ]) &&
      includesAll(modules.dto, [
        "def admin_user_activation_dto",
        '"legacy_mirrored"',
        '"replayed"',
        '"event"',
      ]) &&
      includesAll(modules.gateways, [
        "def set_admin_user_active",
        "UPDATE dbo.app_profiles SET is_active = %s",
        "LAST_OWNER_PROTECTED",
        "def set_database_role",
        "UPDATE dbo.app_roles SET role",
        "INSERT INTO dbo.app_roles",
      ]) &&
      includesAll(modules.audit, [
        '"account.activated"',
        '"account.deactivated"',
        '"account.role_changed"',
      ]),
    adminUserSessionRevokeRoute:
      includesAll(modules.app, [
        'ADMIN_USER_SESSION_REVOKE_ROUTE = "admin/users/{user_id}/sessions/{session_id}/revoke"',
        "ADMIN_USER_SESSION_REVOKE_ALLOWED_FIELDS",
        "MANAGE_USER_SESSIONS",
        "def _admin_user_session_revoke",
        "def _admin_user_session_revoke_ids_from_route",
        "use the self-service session route",
        "target_role",
        "revoked = deps.gateway.revoke_account_session",
        "SESSION_EVENT_REVOKED",
      ]) &&
      includesAll(modules.dto, [
        "def admin_user_session_revoke_dto",
        '"legacy_mirrored"',
        '"replayed"',
        '"session"',
      ]) &&
      includesAll(modules.gateways, [
        "def revoke_account_session",
        "UPDATE dbo.account_sessions ",
        "SET revoked_at = %s, revoked_by = %s, revoke_reason = %s ",
        "WHERE id = %s AND user_id = %s",
      ]) &&
      includesAll(modules.sessions, ["def clean_revoke_reason", "REVOKE_ALLOWED_FIELDS"]) &&
      includesAll(modules.capabilities, ['MANAGE_USER_SESSIONS = "sessions:revoke-any"']) &&
      includesAll(modules.audit, ['"session.revoked"']),
    notificationRoutes:
      includesAll(modules.app, [
        'NOTIFICATIONS_ROUTE = "notifications"',
        'NOTIFICATION_STATE_ROUTE = "notifications/state"',
        'NOTIFICATION_RECEIPTS_ROUTE = "notifications/receipts"',
        'ADMIN_NOTIFICATIONS_ROUTE = "admin/notifications"',
        'ADMIN_NOTIFICATIONS_UPDATE_ROUTE = "admin/notifications/update"',
        'ADMIN_NOTIFICATION_EMAIL_ROUTE = "admin/email"',
        'ADMIN_NOTIFICATION_EMAIL_ENQUEUE_ROUTE = "admin/email/enqueue"',
        'ADMIN_NOTIFICATION_EMAIL_OUTCOME_ROUTE = "admin/email/{job_id}/outcome"',
        "MANAGE_NOTIFICATIONS",
        "def _notifications",
        "def _notification_state",
        "def _notification_receipt",
        "def _admin_notifications_update",
        "def _admin_notification_email",
        "def _admin_notification_email_enqueue",
        "def _admin_notification_email_outcome",
        "def _admin_notification_email_job_id_from_route",
        "visible_notifications",
        "read_notification_document",
        "write_notification_document",
        "read_notification_email_queue_document",
        "write_notification_email_queue_document",
        "NOTIFICATION_EVENT_UPDATED",
        "NOTIFICATION_EVENT_RECEIPT",
        "NOTIFICATION_EVENT_EMAIL_QUEUED",
        "NOTIFICATION_EVENT_EMAIL_OUTCOME",
        "QUOTA_EXCEEDED",
      ]) &&
      includesAll(modules.notifications, [
        "NOTIFICATION_ALLOWED_FIELDS",
        "NOTIFICATION_RECEIPT_ALLOWED_FIELDS",
        "NOTIFICATION_EMAIL_ALLOWED_FIELDS",
        "NOTIFICATION_EMAIL_OUTCOME_ALLOWED_FIELDS",
        "MAX_NOTIFICATIONS = 200",
        "MAX_NOTIFICATION_EMAIL_JOBS = 500",
        "NOTIFICATION_EMAIL_DAILY_LIMIT = 25",
        "SCRIPT_PATTERN",
        "links must use https",
        "selected requires a user id or email",
        "def visible_notifications",
        "def notification_receipt_record_from_row",
        "def sanitize_notification_email_job",
        "def apply_notification_email_outcome",
        "def claim_notification_email_attempt",
        "def finish_notification_email_attempt",
        "def clean_notification_email_outcome",
        "def notification_email_daily_count",
      ]) &&
      includesAll(modules.email_worker, [
        "class BrevoEmailSender",
        "def run_notification_email_worker",
        "def resolve_notification_email_recipients",
        "claim_notification_email_attempt",
        "finish_notification_email_attempt",
        "textContent",
        "delivery provider unavailable",
        "recipient_count",
      ]) &&
      includesAll(modules.config, [
        "email_worker_enabled",
        "BREVO_API_KEY",
        "BREVO_SENDER_EMAIL",
        "QT_ACCOUNT_API_EMAIL_WORKER_ENABLED",
        "require_email_delivery",
      ]) &&
      includesAll(sources.functionApp, [
        "@app.timer_trigger",
        "notification_email_worker",
        "run_notification_email_worker",
        "BrevoEmailSender",
      ]) &&
      includesAll(modules.dto, [
        "def notifications_dto",
        "def notification_state_dto",
        "def admin_notifications_dto",
        "def notification_receipt_dto",
        "def admin_notification_email_queue_dto",
        "def admin_notification_email_enqueue_dto",
        "def admin_notification_email_outcome_dto",
        "include_target=False",
        "include_target=True",
      ]) &&
      includesAll(modules.gateways, [
        "NOTIFICATIONS_BLOB",
        "NOTIFICATION_EMAIL_QUEUE_BLOB",
        "class NotificationBlobStore",
        "class NotificationEmailQueueBlobStore",
        "def read_notification_document",
        "def read_notification_receipts",
        "def write_notification_document",
        "def read_notification_email_queue_document",
        "def write_notification_email_queue_document",
        "WHERE user_id = %s AND event_type = %s AND actor_user_id = %s ",
        '"success", "account-api", min(limit, 500)',
        "upload_blob",
        "app-config/notifications.json",
        "app-config/notification-email-queue.json",
      ]) &&
      includesAll(modules.capabilities, ['MANAGE_NOTIFICATIONS = "notifications:write"']) &&
      includesAll(modules.audit, [
        '"notification.updated"',
        '"notification.receipt"',
        '"notification.email_queued"',
        '"notification.email_outcome"',
      ]),
    ownerStatusRoutes:
      includesAll(modules.app, [
        'ADMIN_CONFIGURATION_ROUTE = "admin/configuration"',
        'ADMIN_CREDENTIALS_ROUTE = "admin/credentials"',
        'ADMIN_RELEASES_ROUTE = "admin/releases"',
        "def _admin_configuration",
        "def _admin_credentials",
        "def _admin_releases",
        "admin_configuration_status_dto",
        "admin_credential_status_dto",
        "admin_release_status_dto",
      ]) &&
      includesAll(modules.dto, [
        "def admin_configuration_status_dto",
        "def admin_credential_status_dto",
        "def admin_release_status_dto",
        '"rotation": "source-locked"',
        '"status": "source-locked"',
      ]) &&
      includesAll(modules.config, [
        "email_worker_enabled",
        "artifact_worker_enabled",
        "artifact_worker_batch_limit",
        "deletion_worker_enabled",
        "deletion_worker_batch_limit",
        "account_export_encryption_key",
        "brevo_api_key",
        "brevo_sender_email",
        "signed_downloads_enabled",
        "private_artifact_container",
      ]) &&
      includesAll(modules.dto, [
        "artifact_worker_enabled",
        "artifact_worker_batch_limit",
        "deletion_worker_enabled",
        "deletion_worker_batch_limit",
        "account_export_encryption_configured",
        "signed_download_ttl_seconds",
        "signed_downloads_enabled",
        "private_artifact_storage_configured",
      ]) &&
      includesAll(modules.capabilities, [
        'READ_CONFIGURATION = "configuration:read"',
        'READ_CREDENTIAL_STATUS = "credentials:read-status"',
        'READ_RELEASE_STATUS = "releases:read-status"',
      ]),
    managedSecretRoutes:
      includesAll(modules.app, [
        'ADMIN_SECRETS_ROUTE = "admin/secrets"',
        'ADMIN_SECRET_SET_ROUTE = "admin/secrets/{slot}"',
        'ADMIN_SECRET_REVOKE_ROUTE = "admin/secrets/{slot}/revoke"',
        'ADMIN_SECRET_RESTORE_ROUTE = "admin/secrets/{slot}/restore"',
        // The slot is resolved against the catalogue, so an arbitrary path segment is a
        // 404 rather than a write to a name nothing reads.
        "def _secret_slot_from_route",
        "SLOTS_BY_NAME",
      ]) &&
      // Reading the inventory and changing it are separate permissions. Collapsed into
      // one, everybody who can diagnose a failing key can also replace it.
      includesAll(modules.capabilities, [
        'READ_SECRETS = "secrets:read"',
        'WRITE_SECRETS = "secrets:write"',
      ]),
    reportRoutes:
      includesAll(modules.app, [
        'ADMIN_REPORTS_ROUTE = "admin/reports"',
        'ADMIN_REPORTS_ENQUEUE_ROUTE = "admin/reports/enqueue"',
        'ADMIN_REPORT_DOWNLOAD_ROUTE = "admin/reports/{report_id}/download"',
        "def _admin_reports",
        "def _admin_reports_enqueue",
        "def _admin_report_download",
        "REPORT_EVENT_QUEUED",
        "REPORT_EVENT_DOWNLOAD_REQUESTED",
        "REPORT_NOT_READY",
        "REPORT_EXPIRED",
      ]) &&
      includesAll(modules.reports, [
        "def audit_events_to_csv",
        "def formula_safe_cell",
        "def sanitize_report_job",
        "def private_report_jobs",
        "def find_private_report_job",
        "REPORT_DOWNLOAD_TTL_SECONDS",
        'REPORT_TYPES: frozenset[str] = frozenset({"audit-events"})',
        'REPORT_FORMATS: frozenset[str] = frozenset({"csv"})',
      ]) &&
      includesAll(modules.dto, [
        "def admin_reports_dto",
        "def admin_report_enqueue_dto",
        "def admin_report_download_dto",
        '"source_locked": signed_url is None',
        '"url": signed_url',
      ]) &&
      includesAll(modules.gateways, [
        "ADMIN_REPORT_QUEUE_BLOB",
        "class AdminReportQueueBlobStore",
        "def read_admin_report_queue_document",
        "def write_admin_report_queue_document",
        "app-config/admin-report-queue.json",
      ]) &&
      includesAll(modules.audit, ['"reports.queued"', '"reports.download_requested"']),
    accountLifecycleRoutes:
      includesAll(modules.app, [
        'ACCOUNT_LIFECYCLE_ROUTE = "account/lifecycle"',
        'ACCOUNT_EXPORTS_REQUEST_ROUTE = "account/exports/request"',
        'ACCOUNT_EXPORT_DOWNLOAD_ROUTE = "account/exports/{export_id}/download"',
        'ACCOUNT_DELETION_REQUEST_ROUTE = "account/deletion/request"',
        'ACCOUNT_DELETION_CANCEL_ROUTE = "account/deletion/cancel"',
        "def _account_lifecycle",
        "def _account_export_request",
        "def _account_export_download",
        "def _account_deletion_request",
        "def _account_deletion_cancel",
        "read_account_lifecycle_document",
        "write_account_lifecycle_document",
        "ACCOUNT_EXPORT_EVENT_REQUESTED",
        "ACCOUNT_EXPORT_EVENT_DOWNLOAD_REQUESTED",
        "ACCOUNT_DELETION_EVENT_REQUESTED",
        "ACCOUNT_DELETION_EVENT_CANCELLED",
        "require_deletion_cancel_confirmation",
        "ACCOUNT_EXPORT_NOT_READY",
        "ACCOUNT_EXPORT_EXPIRED",
        "create_private_artifact_download_url",
      ]) &&
      includesAll(modules.lifecycle, [
        'ACCOUNT_EXPORT_CONFIRMATION = "EXPORT MY DATA"',
        'ACCOUNT_DELETION_CONFIRMATION = "DELETE MY ACCOUNT"',
        'ACCOUNT_DELETION_CANCEL_CONFIRMATION = "KEEP MY ACCOUNT"',
        "ACCOUNT_EXPORT_RETENTION_SECONDS = 7 * 24 * 60 * 60",
        "ACCOUNT_EXPORT_DOWNLOAD_TTL_SECONDS = 15 * 60",
        "ACCOUNT_DELETION_COOLING_OFF_SECONDS = 14 * 24 * 60 * 60",
        "ACCOUNT_CLEANUP_STEPS",
        "audit_tombstone",
        "desktop-cache-guidance",
        "artifact_ref",
        "encrypted",
        "legal_hold",
        "def assert_can_request_deletion",
        "def cancel_deletion_request",
      ]) &&
      includesAll(modules.dto, [
        "def account_lifecycle_dto",
        "def account_export_job_dto",
        "def account_export_download_dto",
        "def account_deletion_request_dto",
        '"source_locked": signed_url is None',
        '"private": True',
        '"encrypted"',
        '"url": signed_url',
        '"cooling_off_seconds"',
        '"offline_desktop_cache_note": "not-remotely-deletable"',
      ]) &&
      includesAll(modules.gateways, [
        "ACCOUNT_LIFECYCLE_BLOB",
        "class AccountLifecycleBlobStore",
        "def read_account_lifecycle_document",
        "def write_account_lifecycle_document",
        "app-config/account-lifecycle.json",
      ]) &&
      includesAll(modules.audit, [
        '"account.export_requested"',
        '"account.export_download_requested"',
        '"account.deletion_requested"',
        '"account.deletion_cancelled"',
      ]),
    privateArtifactDownloads:
      includesAll(modules.app, [
        "def create_private_artifact_download_url",
        "download_url = deps.gateway.create_private_artifact_download_url",
        "download_url=download_url",
      ]) &&
      includesAll(modules.dto, [
        "def _download_url",
        "download_url: str | None",
        '"source_locked": signed_url is None',
        '"url": signed_url',
      ]) &&
      includesAll(modules.config, [
        "private_artifact_container",
        "signed_downloads_enabled",
        "signed_download_ttl_seconds",
        "QT_ACCOUNT_API_PRIVATE_ARTIFACT_CONTAINER",
        "QT_ACCOUNT_API_SIGNED_DOWNLOADS_ENABLED",
        "require_private_artifact_downloads",
      ]) &&
      includesAll(modules.gateways, [
        "class PrivateArtifactDownloadStore",
        "def create_download_url",
        "require_private_artifact_downloads",
        "get_blob_properties",
        'metadata.get("sha256")',
        "size != expected_bytes",
        "generate_blob_sas",
        "BlobSasPermissions(read=True)",
        'cache_control="private, no-store"',
      ]),
    reportGenerationWorker:
      includesAll(modules.report_worker, [
        "def run_admin_report_worker",
        "artifact_worker_enabled",
        "claim_report_generation_attempt",
        "finish_report_generation_attempt",
        "read_admin_audit_events",
        "audit_events_to_csv",
        "write_private_artifact",
        "csv_digest",
        "REPORT_EVENT_GENERATED",
        "report generation unavailable",
      ]) &&
      includesAll(modules.reports, [
        "REPORT_EVENT_GENERATED",
        "REPORT_WORKER_VISIBILITY_SECONDS",
        "def claim_report_generation_attempt",
        "def finish_report_generation_attempt",
        "def report_artifact_ref",
      ]) &&
      includesAll(sources.functionApp, ["admin_report_worker", "run_admin_report_worker"]) &&
      includesAll(modules.audit, ['"reports.generated"']) &&
      includesAll(modules.config, [
        "artifact_worker_enabled",
        "artifact_worker_batch_limit",
        "QT_ACCOUNT_API_ARTIFACT_WORKER_ENABLED",
        "QT_ACCOUNT_API_ARTIFACT_WORKER_BATCH_LIMIT",
        "require_private_artifact_storage",
      ]) &&
      includesAll(modules.gateways, [
        "def write_private_artifact",
        "def write_artifact",
        "upload_blob",
        "metadata={",
        "BlobAlreadyExists",
      ]),
    accountExportGenerationWorker:
      includesAll(modules.account_export_worker, [
        "def run_account_export_worker",
        "artifact_worker_enabled",
        "require_account_export_encryption",
        "claim_account_export_generation_attempt",
        "finish_account_export_generation_attempt",
        "read_account_export_profile",
        "read_account_export_preferences",
        "read_account_export_rows",
        "read_account_sessions",
        "read_account_activity_events",
        "read_notification_receipts",
        "write_private_artifact",
        "Fernet",
        "application/octet-stream",
        "export generation unavailable",
        "ACCOUNT_EXPORT_EVENT_GENERATED",
      ]) &&
      includesAll(modules.lifecycle, [
        "ACCOUNT_EXPORT_EVENT_GENERATED",
        "ACCOUNT_EXPORT_WORKER_VISIBILITY_SECONDS",
        "def claim_account_export_generation_attempt",
        "def finish_account_export_generation_attempt",
        "def account_export_artifact_ref",
        "portfolio_accounts",
        "watchlists",
        ".json.enc",
      ]) &&
      includesAll(sources.functionApp, ["account_export_worker", "run_account_export_worker"]) &&
      includesAll(modules.audit, ['"account.exported"']) &&
      includesAll(modules.config, [
        "account_export_encryption_key",
        "QT_ACCOUNT_API_EXPORT_ENCRYPTION_KEY",
        "require_account_export_encryption",
      ]) &&
      includesAll(modules.gateways, [
        "ACCOUNT_EXPORT_PROFILE_SELECT_COLUMNS",
        "ACCOUNT_EXPORT_PREFERENCES_SELECT_COLUMNS",
        "ACCOUNT_EXPORT_ROW_SELECTS",
        "def read_account_export_profile",
        "def read_account_export_preferences",
        "def read_account_export_rows",
        "portfolio_transactions",
        "app_user_profiles",
      ]) &&
      includesAll(modules.app, ["application/octet-stream", ".json.enc"]),
    accountDeletionCleanupWorker:
      includesAll(modules.account_deletion_worker, [
        "def run_account_deletion_cleanup_worker",
        "deletion_worker_enabled",
        "claim_account_deletion_cleanup_attempt",
        "finish_account_deletion_cleanup_attempt",
        "revoke_account_sessions_for_deletion",
        "delete_private_artifacts_for_deletion",
        "account_export_artifact_ref",
        "PROVIDER_DELETE_BLOCKER",
        "source-locked",
        "ACCOUNT_DELETION_EVENT_CLEANUP",
        "deletion cleanup unavailable",
      ]) &&
      includesAll(modules.lifecycle, [
        "ACCOUNT_DELETION_EVENT_CLEANUP",
        "ACCOUNT_DELETION_WORKER_VISIBILITY_SECONDS",
        "def claim_account_deletion_cleanup_attempt",
        "def finish_account_deletion_cleanup_attempt",
      ]) &&
      includesAll(sources.functionApp, [
        "account_deletion_cleanup_worker",
        "run_account_deletion_cleanup_worker",
      ]) &&
      includesAll(modules.audit, ['"account.deletion_cleanup"']) &&
      includesAll(modules.config, [
        "deletion_worker_enabled",
        "deletion_worker_batch_limit",
        "QT_ACCOUNT_API_DELETION_WORKER_ENABLED",
        "QT_ACCOUNT_API_DELETION_WORKER_BATCH_LIMIT",
        "require_private_artifact_storage",
      ]) &&
      includesAll(modules.gateways, [
        "def revoke_account_sessions_for_deletion",
        "def delete_private_artifacts_for_deletion",
        "def delete_artifacts",
        "delete_blob",
        'delete_snapshots="include"',
        "WHERE user_id = %s AND revoked_at IS NULL",
      ]),
    // Dual read, and the report can never certify a cutover it could not evidence.
    dualReadRolesWithoutCutover:
      includesAll(modules.roles, [
        "EXPECTED_OWNER_PROJECTION",
        "MISSING_IN_DATABASE",
        "DIVERGENT",
        "def reconcile",
        // Readiness is decided from the blob's own readability and entry count.
        "return self.legacy_blob_readable",
        // The legacy registry is the blob plus the environment bootstrap admins the
        // legacy function re-applies; reconciling the blob alone can certify a cutover
        // that drops a working administrator.
        "def legacy_registry",
        "bootstrap_admin_ids",
        // Blob readability is tracked separately from the merged registry, so the
        // bootstrap admins folded into it cannot make an unread blob look read. The
        // derivation is pinned too: reading it off the merged registry instead is a
        // one-word edit that would leave every other literal here in place.
        "legacy_blob_readable=legacy_roles is not None",
        "return self.legacy_blob_readable",
        "self.legacy_blob_entry_count > 0",
        // An entry nobody could parse is an entry nobody reconciled, so it blocks too.
        "self.legacy_unparsable_entry_count == 0",
      ]) &&
      includesNone(modules.gateways, ["_set_server_role", '"PUT"', '"DELETE"']) &&
      !mutatingGatewayRoleWrites(modules.gateways),
    pinnedRequirements: requirementsArePinned(sources.requirements),
    safeStagingInfrastructure: infrastructureIsSafe(sources.infrastructure),
  };
}
