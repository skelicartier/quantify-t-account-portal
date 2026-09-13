import {
  type EnvironmentPresence,
  type NetworkProbe,
  type PreflightCheck,
  type PreflightReport,
  type PreflightStatus,
  type RepositorySnapshot,
} from "@/lib/preflight/model";

const REQUIRED_PUBLIC_ENVIRONMENT = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "QT_ACCOUNT_API_URL",
  // The update function's origin. Required rather than optional because the console is the
  // only place a release can be published from: without it there is no way to ship a fix.
  "QT_UPDATE_DEPLOY_URL",
] as const;

const FORBIDDEN_PORTAL_ENVIRONMENT = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AZURE_STORAGE_CONNECTION_STRING",
  "BREVO_API_KEY",
  "QT_ACCOUNT_API_EXPORT_ENCRYPTION_KEY",
  "QT_AUTH_RESET_SECRET",
  "QT_RELEASE_SIGNING_PRIVATE_KEY",
] as const;

// The legacy update function after the Supabase decommission: shared configuration,
// notifications, credential telemetry, releases and admin email. Accounts, roles,
// activation and passwords are the Account API's.
const CURRENT_AZURE_ROUTES = [
  "deploy_update",
  "release_history",
  "set_app_config",
  "app_config",
  "management_set_notifications",
  "management_list_notifications",
  "notifications",
  "credential_usage",
  "credential_status",
  "reset_credential_usage",
  "management_me",
  "management_send_email",
] as const;

// Azure SQL tables the Account API and the desktop rely on (schema snapshot in the
// desktop repository, cloud/azure/account_function/schema/azure_sql_schema.sql).
const REQUIRED_SCHEMA_OBJECTS = [
  "app_users",
  "app_profiles",
  "app_roles",
  "account_sessions",
  "auth_events",
  "app_states",
  "app_user_profiles",
  "watchlists",
  "admin_activity_logs",
  // Subscriptions, entitlements and server-enforced quotas. The console renders plans
  // and allowances from these; shipping those screens against a database that has not
  // been migrated would show every account as Free.
  "account_subscription_state",
  "account_entitlements",
  "usage_counters",
  "usage_events",
] as const;

const PLACEHOLDER_MARKERS = [
  "replace-with",
  "example.",
  "your-project",
  "placeholder",
  "localhost",
] as const;

function check(
  id: string,
  category: PreflightCheck["category"],
  status: PreflightStatus,
  summary: string,
  evidence: string[] = [],
): PreflightCheck {
  return { id, category, status, summary, evidence };
}

function includesEvery(source: string | null, values: readonly string[]): boolean {
  return source !== null && values.every((value) => source.includes(value));
}

function includesAny(source: string | null, values: readonly string[]): boolean {
  return source !== null && values.some((value) => source.includes(value));
}

function pythonMethodSource(source: string | null, methodName: string): string {
  if (source === null) return "";
  const marker = `    def ${methodName}(`;
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const rest = source.slice(start);
  const next = rest.slice(marker.length).search(/\n    def [A-Za-z_][A-Za-z0-9_]*\(/);
  return next < 0 ? rest : rest.slice(0, marker.length + next);
}

function keepsAppPasscodeOffTheCloud(
  authService: string | null,
  azureFunction: string | null,
): boolean {
  // The property is "the app passcode never leaves the device", not "the string
  // app_passcode_hash does not appear". Matching the bare identifier flagged the desktop for
  // the twenty-odd lines that exist to *remove* the legacy data: the keychain key name, the
  // save/read pair, and the migration that lifts a legacy hash out of the profile column and
  // leaves APP_PASSCODE_STORE_MARKER in its place. Deleting those to satisfy the check would
  // strand every install that has not migrated yet — the check would pass and the product
  // would be worse. This is the same limitation model.ts already records about
  // AccountApiEvidence: a string search cannot tell a defect from the code that fixes it.
  const push = pythonMethodSource(authService, "_push_app_passcode_to_cloud");

  // Checking that one method is a no-op is necessary and not sufficient: a mirror added to
  // any *other* method would sail past it. So also assert the property across the whole file
  // — no single line both names a passcode and hands it to something outbound. That is still
  // a heuristic, but it is one keyed on the two halves that have to meet for a leak to exist,
  // rather than on the name of the method somebody happened to use last time.
  const OUTBOUND = [
    "payload=",
    "_account_api_request",
    "update_user_metadata",
    "json=",
    "requests.",
    "urlopen",
  ];
  const mirroredAnywhere = (authService ?? "")
    .split(/\r?\n/)
    .some((line) => /passcode/i.test(line) && OUTBOUND.some((call) => line.includes(call)));

  return (
    // The one path that exists to mirror a verifier upstream is a documented no-op.
    includesEvery(push, ["def _push_app_passcode_to_cloud(", "return"]) &&
    !push.includes("requests.") &&
    !push.includes("urlopen") &&
    !push.includes("_account_api_request") &&
    !push.includes("update_user_metadata") &&
    // Nowhere else sends one either.
    !mirroredAnywhere &&
    // The profile column carries a marker, not a verifier.
    (authService ?? "").includes("APP_PASSCODE_STORE_MARKER") &&
    // And the cloud function has no notion of one at all.
    !includesAny(azureFunction, ["app_passcode_hash"])
  );
}

function hasDesktopCloudPasswordLock(source: string | null): boolean {
  const helper = pythonMethodSource(source, "_hash_cloud_local_password_lock");
  const upsert = pythonMethodSource(source, "_upsert_local_cloud_user");
  const changePassword = pythonMethodSource(source, "change_password");

  return (
    includesEvery(helper, [
      "def _hash_cloud_local_password_lock(self)",
      "return self.hash_password(secrets.token_urlsafe(48))",
    ]) &&
    includesEvery(upsert, [
      "def _upsert_local_cloud_user(",
      "password_hash = self._hash_cloud_local_password_lock()",
      "user.password_hash = password_hash",
    ]) &&
    !upsert.includes("self.hash_password(password)") &&
    // Passwords belong to the console: the desktop never hashes or stores one.
    includesEvery(changePassword, ["def change_password(", "account console"]) &&
    !changePassword.includes("hash_password(") &&
    !(source ?? "").includes("def reset_password(")
  );
}

function hasDesktopRevokedSessionRuntimeGuard(source: string | null): boolean {
  const init = source ?? "";
  const marker = pythonMethodSource(source, "_mark_account_session_revoked");
  const sendEvent = pythonMethodSource(source, "_send_account_session_event");
  const validate = pythonMethodSource(source, "validate_session");
  const createSession = pythonMethodSource(source, "create_session");

  return (
    init.includes("_account_session_revoked_user_ids: set[int] = set()") &&
    includesEvery(marker, [
      "def _mark_account_session_revoked(self, user_id: int)",
      "self._account_session_revoked_user_ids.add(int(user_id))",
      "self.clear_session_file()",
      "self.clear_cloud_session_files()",
    ]) &&
    includesEvery(sendEvent, [
      "if self._account_session_denied_text(str(exc)):",
      "self._mark_account_session_revoked(int(user_id))",
    ]) &&
    includesEvery(validate, [
      "if int(user.id) in self._account_session_revoked_user_ids:",
      "record.is_active = False",
      "record.ended_at = now",
      "return None, None",
    ]) &&
    createSession.includes("self._account_session_revoked_user_ids.discard(int(db_user.id))")
  );
}

function hasDesktopVersionedProfileWriter(source: string | null): boolean {
  if (source === null) return false;
  const writer = pythonMethodSource(source, "_account_api_update_profile");
  const push = pythonMethodSource(source, "_push_cloud_profile_changes");
  return (
    includesEvery(writer, [
      "def _account_api_update_profile(",
      "'auth/user/profile/update'",
      "expected_profile_version",
      "ACCOUNT_PROFILE_UPDATE_FIELDS",
      "idempotency_key",
    ]) &&
    push.includes("return self._account_api_update_profile(access_token, changes)") &&
    !source.includes("update_my_app_profile") &&
    !source.includes("upsert_app_profile(")
  );
}

/** Anything that would mean the desktop still talks to, stores or configures Supabase. */
function desktopSupabaseTraces(snapshot: RepositorySnapshot): string[] {
  const traces: string[] = [];
  if (snapshot.desktopSupabaseService !== null) {
    traces.push("src/services/supabase_service.py still exists.");
  }
  for (const marker of [
    "supabase_service.",
    "SupabaseService",
    "SupabaseServiceError",
    "_supabase_context_for_user",
    "/rest/v1/",
    "/auth/v1/",
  ]) {
    if (snapshot.desktopAuthService?.includes(marker)) {
      traces.push(`auth_service.py references ${marker}`);
    }
  }
  if (snapshot.desktopEnvironmentExample?.includes("SUPABASE_")) {
    traces.push(".env.example still lists SUPABASE_* keys.");
  }
  return traces;
}

function environmentExampleIsAllowListed(source: string | null): boolean {
  if (source === null) return false;
  const allowedNames = new Set<string>([
    ...REQUIRED_PUBLIC_ENVIRONMENT,
    "QT_MARKETING_SITE_URL",
    "QT_DESKTOP_PROJECT_PATH",
  ]);
  const configuredNames = new Set<string>();

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const match = /^([A-Z][A-Z0-9_]*)\s*=/.exec(line);
    if (!match?.[1] || !allowedNames.has(match[1])) return false;
    configuredNames.add(match[1]);
  }

  return REQUIRED_PUBLIC_ENVIRONMENT.every((name) => configuredNames.has(name));
}

function hasSchemaTable(schema: string | null, table: string): boolean {
  if (schema === null) return false;
  const normalized = schema.replace(/\s+/g, " ").toLowerCase();
  const escapedTable = table.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `\\bcreate table (?:if not exists )?(?:dbo|public)\\.${escapedTable}\\s*\\(`,
  ).test(normalized);
}

export function extractAzureRoutes(source: string | null): string[] {
  if (source === null) return [];
  const routes = new Set<string>();
  const matcher = /route\s*=\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(matcher)) {
    const route = match[1];
    if (route) routes.add(route);
  }
  return [...routes].sort();
}

function dependenciesArePinned(packageJson: string | null): boolean {
  if (packageJson === null) return false;
  try {
    const parsed = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const versions = [
      ...Object.values(parsed.dependencies ?? {}),
      ...Object.values(parsed.devDependencies ?? {}),
    ];
    return (
      versions.length > 0 &&
      versions.every((version) => /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
    );
  } catch {
    return false;
  }
}

export function summarizeEnvironment(
  environment: Record<string, string | undefined>,
): EnvironmentPresence[] {
  const required = REQUIRED_PUBLIC_ENVIRONMENT.map((name) => {
    const value = String(environment[name] ?? "").trim();
    return {
      name,
      configured: value.length > 0,
      placeholder: PLACEHOLDER_MARKERS.some((marker) => value.toLowerCase().includes(marker)),
      forbidden: false,
    };
  });

  const forbidden = FORBIDDEN_PORTAL_ENVIRONMENT.map((name) => ({
    name,
    configured: String(environment[name] ?? "").trim().length > 0,
    placeholder: false,
    forbidden: true,
  }));

  return [...required, ...forbidden];
}

export function auditRepositories(snapshot: RepositorySnapshot): PreflightCheck[] {
  const checks: PreflightCheck[] = [];

  checks.push(
    check(
      "portal.package",
      "portal",
      snapshot.portalPackageJson ? "pass" : "blocked",
      snapshot.portalPackageJson
        ? "Portal package manifest is present."
        : "Portal package manifest is missing.",
    ),
  );
  checks.push(
    check(
      "portal.dependencies",
      "portal",
      dependenciesArePinned(snapshot.portalPackageJson) ? "pass" : "blocked",
      dependenciesArePinned(snapshot.portalPackageJson)
        ? "Portal runtime and test dependencies use exact versions."
        : "Portal dependencies are missing or use open version ranges.",
    ),
  );
  checks.push(
    check(
      "portal.environment-contract",
      "portal",
      environmentExampleIsAllowListed(snapshot.portalEnvironmentExample) ? "pass" : "blocked",
      "Portal environment example exposes only the expected public/account API contract.",
      snapshot.portalEnvironmentExample
        ? ["Checked variable names only; no values were loaded from .env files."]
        : [".env.example is missing."],
    ),
  );

  const lifecycleEvidence = snapshot.portalAuthLifecycleEvidence;
  const lifecycleComplete =
    lifecycleEvidence !== null && Object.values(lifecycleEvidence).every(Boolean);
  checks.push(
    check(
      "portal.auth-lifecycle",
      "portal",
      lifecycleComplete ? "pass" : "blocked",
      lifecycleComplete
        ? "Portal Azure token confirmation/reset, current-password reauthentication, same-origin Server Actions, assurance-gated account mutations, source-locked MFA/email-change controls, self session/activity reads, and Account API lifecycle hooks are structurally represented per file."
        : "Portal account-lifecycle relationships are missing or structurally incomplete.",
      lifecycleEvidence
        ? Object.entries(lifecycleEvidence)
            .filter(([, present]) => !present)
            .map(([relationship]) => `Missing relationship: ${relationship}`)
        : ["Per-file lifecycle evidence is unavailable."],
    ),
  );

  const securityEvidence = snapshot.portalSecurityEvidence;
  const credentialSecurityComplete =
    securityEvidence?.enforcedChallengeCompatibleCsp === true &&
    securityEvidence.exactNoStoreRoutes;
  checks.push(
    check(
      "portal.credential-security",
      "portal",
      credentialSecurityComplete ? "pass" : "blocked",
      credentialSecurityComplete
        ? "Evaluated header rules enforce the challenge-compatible CSP and exact credential-route no-store set."
        : "Evaluated credential-route CSP or exact no-store controls are incomplete.",
      securityEvidence
        ? [`Evaluated no-store routes: ${securityEvidence.noStoreRoutes.join(", ")}`]
        : ["Evaluated Next.js header evidence is unavailable."],
    ),
  );

  const desktopEnvironment = snapshot.desktopEnvironmentExample;
  checks.push(
    check(
      "desktop.public-cloud-contract",
      "desktop",
      includesEvery(desktopEnvironment, [
        "QT_ACCOUNT_API_URL",
        "QT_ACCOUNT_PORTAL_URL",
        "QT_AUTH_API_ENDPOINT",
      ]) && !desktopEnvironment?.includes("SUPABASE_")
        ? "pass"
        : "blocked",
      "Desktop documents its public Azure endpoint contract (Account API, console, update function) and nothing from Supabase.",
    ),
  );
  const supabaseTraces = desktopSupabaseTraces(snapshot);
  checks.push(
    check(
      "desktop.no-supabase",
      "desktop",
      supabaseTraces.length === 0 ? "pass" : "blocked",
      supabaseTraces.length === 0
        ? "The desktop carries no Supabase client, session store or configuration."
        : "Supabase code or configuration is still present in the desktop.",
      supabaseTraces,
    ),
  );
  checks.push(
    check(
      "desktop.legacy-pin-metadata",
      "desktop",
      keepsAppPasscodeOffTheCloud(snapshot.desktopAuthService, snapshot.desktopAzureFunction)
        ? "pass"
        : "warning",
      "The app passcode verifier must stay on the device: never mirrored to cloud metadata, never known to the Azure function.",
    ),
  );
  checks.push(
    check(
      "desktop.versioned-profile-writer",
      "desktop",
      hasDesktopVersionedProfileWriter(snapshot.desktopAuthService) ? "pass" : "blocked",
      hasDesktopVersionedProfileWriter(snapshot.desktopAuthService)
        ? "Desktop profile and preference writes go through the Account API's versioned profile update."
        : "Desktop profile and preference writes must use the Account API's versioned profile update.",
    ),
  );
  checks.push(
    check(
      "desktop.cloud-password-lock",
      "desktop",
      hasDesktopCloudPasswordLock(snapshot.desktopAuthService) ? "pass" : "blocked",
      hasDesktopCloudPasswordLock(snapshot.desktopAuthService)
        ? "Desktop cloud-auth writes fill the local password column with a random lock hash and never handle a console password."
        : "Desktop cloud-auth paths must stop storing reusable password verifiers locally.",
    ),
  );
  checks.push(
    check(
      "desktop.revoked-session-runtime-guard",
      "desktop",
      hasDesktopRevokedSessionRuntimeGuard(snapshot.desktopAuthService) ? "pass" : "blocked",
      hasDesktopRevokedSessionRuntimeGuard(snapshot.desktopAuthService)
        ? "Desktop marks Account API revoked-session responses and invalidates the running local session on validation."
        : "Desktop must fail closed for already-running local sessions after an Account API revoked-session response.",
    ),
  );

  const schemaSource = (snapshot.azureSqlSchema ?? "").replace(/\s+/g, " ").toLowerCase();
  const schemaFindings = REQUIRED_SCHEMA_OBJECTS.filter(
    (table) => !hasSchemaTable(snapshot.azureSqlSchema, table),
  ).map((table) => `Missing table: ${table}`);
  if (!/\[profile_version\] bigint not null/.test(schemaSource)) {
    schemaFindings.push("Missing profile_version bigint NOT NULL column on app_profiles.");
  }
  if (!/\[role\]='owner'/.test(schemaSource)) {
    schemaFindings.push("Missing canonical role constraint including Owner.");
  }
  checks.push(
    check(
      "azure.sql-schema",
      "azure",
      snapshot.azureSqlSchema !== null && schemaFindings.length === 0 ? "pass" : "blocked",
      snapshot.azureSqlSchema === null
        ? "The Azure SQL schema snapshot is unavailable."
        : schemaFindings.length === 0
          ? "Identity, profile, role, session, event, app-state and audit tables are represented in the Azure SQL schema snapshot."
          : "Required Azure SQL tables or constraints are missing from the checked-in schema snapshot.",
      snapshot.azureSqlSchema === null
        ? [
            "Expected cloud/azure/account_function/schema/azure_sql_schema.sql in the desktop repository.",
          ]
        : schemaFindings,
    ),
  );

  const azureRoutes = extractAzureRoutes(snapshot.desktopAzureFunction);
  const missingRoutes = CURRENT_AZURE_ROUTES.filter((route) => !azureRoutes.includes(route));
  checks.push(
    check(
      "azure.current-routes",
      "azure",
      missingRoutes.length === 0 ? "pass" : "blocked",
      missingRoutes.length === 0
        ? `All ${CURRENT_AZURE_ROUTES.length} documented Azure routes are present in source.`
        : "The checked-in Azure Function does not contain every documented route.",
      missingRoutes.map((route) => `Missing route: ${route}`),
    ),
  );

  checks.push(
    check(
      "azure.wildcard-cors",
      "azure",
      snapshot.desktopAzureFunction?.includes('"Access-Control-Allow-Origin": "*"') ||
        snapshot.desktopAzureFunction?.includes("'Access-Control-Allow-Origin': '*'")
        ? "warning"
        : "pass",
      "Azure browser CORS must be exact-origin or removed before portal production use.",
    ),
  );

  checks.push(
    check(
      "azure.production-documentation",
      "azure",
      includesEvery(snapshot.desktopAzureDocumentation, [
        "rg-quantify-terminal-prod",
        "func-quantify-updates-prod",
        "qtterminalprod001",
      ])
        ? "pass"
        : "blocked",
      "Production Azure resource names and public API base are documented without embedding secret values.",
    ),
  );

  const requirementLines = (snapshot.desktopAzureRequirements ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  const requirementsArePinned =
    requirementLines.length > 0 &&
    requirementLines.every((line) => {
      const requirement = line.split(/\s+#/, 1)[0]?.trim() ?? "";
      return /^[A-Za-z0-9_.-]+(?:\[[^\]]+\])?==[^<>=~^*\s]+(?:\s*;.*)?$/.test(requirement);
    });
  checks.push(
    check(
      "azure.dependency-pins",
      "azure",
      requirementsArePinned ? "pass" : "warning",
      requirementsArePinned
        ? "Azure Function dependencies are exactly pinned."
        : "Azure Function dependencies are missing or not exactly pinned and need reproducible versions before deployment.",
    ),
  );

  checks.push(
    check(
      "azure.account-infrastructure",
      "azure",
      snapshot.accountInfrastructureDefinition ? "pass" : "warning",
      snapshot.accountInfrastructureDefinition
        ? "Account API staging infrastructure is represented as code."
        : "No account API staging infrastructure definition exists yet.",
      snapshot.accountInfrastructureDefinition
        ? ["Reviewed source only; the template has not been linted by ARM or deployed."]
        : [],
    ),
  );

  const accountApi = snapshot.accountApiEvidence;
  const accountApiComplete = accountApi !== null && Object.values(accountApi).every(Boolean);
  checks.push(
    check(
      "azure.account-api-contract",
      "azure",
      accountApiComplete ? "pass" : "blocked",
      accountApiComplete
        ? "Account API package is modular with a versioned prefix, exact-origin CORS, canonical Owner-aware RBAC, typed errors, correlated audit, idempotent mutations, source-only profile read/update, session lifecycle/admin metrics/audit/report/account lifecycle/user administration/session revocation/notification/owner-status routes, private signed artifact downloads, disabled-by-default report/export/deletion cleanup workers, allow-listed responses, and dual-read roles with no cutover."
        : "Account API package structure is missing or incomplete.",
      accountApi
        ? [
            ...Object.entries(accountApi)
              .filter(([, present]) => !present)
              .map(([property]) => `Missing property: ${property}`),
            "Structural source checks only; no live provider, Azure, or ARM behavior is evidenced.",
          ]
        : ["Account API package evidence is unavailable."],
    ),
  );

  checks.push(
    check(
      "marketing.vercel-contract",
      "marketing",
      snapshot.marketingVercelConfig ? "pass" : "blocked",
      snapshot.marketingVercelConfig
        ? "Marketing site Vercel configuration is present."
        : "Marketing site Vercel configuration is missing.",
    ),
  );
  checks.push(
    check(
      "marketing.theme-contract",
      "marketing",
      includesEvery(snapshot.marketingStylesheet, ["--bg:", "--accent:", "--text:"])
        ? "pass"
        : "blocked",
      "Marketing theme tokens required for portal parity are present.",
    ),
  );

  return checks;
}

export function buildPreflightReport(input: {
  snapshot: RepositorySnapshot;
  environment: Record<string, string | undefined>;
  network?: NetworkProbe[];
  generatedAt?: string;
}): PreflightReport {
  const checks = auditRepositories(input.snapshot);
  const environment = summarizeEnvironment(input.environment);
  const network = input.network ?? [];

  for (const variable of environment) {
    if (variable.forbidden && variable.configured) {
      checks.push(
        check(
          `environment.forbidden.${variable.name}`,
          "environment",
          "blocked",
          `${variable.name} must not exist in the portal runtime.`,
        ),
      );
    } else if (!variable.forbidden && (!variable.configured || variable.placeholder)) {
      checks.push(
        check(
          `environment.required.${variable.name}`,
          "environment",
          "warning",
          `${variable.name} is not configured with a non-placeholder staging value.`,
        ),
      );
    } else {
      checks.push(
        check(
          `environment.safe.${variable.name}`,
          "environment",
          "pass",
          variable.forbidden
            ? `${variable.name} is absent from the portal runtime.`
            : `${variable.name} is configured; its value was not recorded.`,
        ),
      );
    }
  }

  for (const probe of network) {
    checks.push(check(`network.${probe.name}`, "network", probe.status, probe.summary));
  }

  const counts: Record<PreflightStatus, number> = { pass: 0, warning: 0, blocked: 0 };
  for (const item of checks) counts[item.status] += 1;

  // These were hardcoded `false`, which made `preflight:strict` incapable of passing by
  // construction — a gate that can only ever fail teaches everyone to ignore it. They stay
  // impossible to unlock from source checks alone, which is what FINAL_LOCAL_CHECKPOINT
  // means by "must not be changed from local tests alone": a clean repository is necessary
  // and is explicitly not sufficient. What lifts them is evidence a person recorded after
  // doing something no static check can do — a staging deployment exercised end to end, and
  // a go/no-go decision.
  //
  // Production reuses the exact constant `assertDeploymentAllowed` already reads, so
  // `preflight:strict` and `prebuild` now agree on one signal instead of disagreeing on two.
  // Both default false on an absent variable, so every existing invocation is unchanged.
  const cleanSource = counts.blocked === 0 && counts.warning === 0;
  const stagingReady = cleanSource && input.environment.QT_STAGING_EVIDENCE === "recorded";
  const productionReady = stagingReady && input.environment.QT_PRODUCTION_GO_NO_GO === "approved";

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    mode: network.length > 0 ? "network" : "offline",
    checks,
    environment,
    network,
    counts,
    sourceReady: counts.blocked === 0,
    stagingReady,
    productionReady,
  };
}

export function preflightExitCode(report: PreflightReport, strictProduction = false): 0 | 1 {
  // A warning now fails the strict gate. It could not before — `blocked` was the only thing
  // that failed anything — so the six warnings this repository carried were invisible to
  // every automated caller. Ordinary (non-strict) callers are unchanged: a warning is still
  // a warning there, which is what keeps it usable during development.
  const strictFailure = strictProduction && (report.counts.warning > 0 || !report.productionReady);
  return report.counts.blocked > 0 || strictFailure ? 1 : 0;
}
