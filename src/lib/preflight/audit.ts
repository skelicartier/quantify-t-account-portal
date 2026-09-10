import {
  DESKTOP_SUPABASE_MIGRATION_ARTIFACTS,
  type EnvironmentPresence,
  type MigrationArtifact,
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

const CURRENT_AZURE_ROUTES = [
  "deploy_update",
  "set_app_config",
  "app_config",
  "management_set_notifications",
  "management_list_notifications",
  "notifications",
  "credential_usage",
  "credential_status",
  "reset_credential_usage",
  "management_me",
  "management_users",
  "management_user_profile",
  "management_create_user",
  "management_update_user",
  "management_set_user_active",
  "management_reset_user_password",
  "management_send_email",
  "auth_request_password_reset",
  "auth_confirm_password_reset",
  "auth_send_otp",
] as const;

const REQUIRED_SCHEMA_OBJECTS = [
  "app_profiles",
  "app_user_profiles",
  "app_roles",
  "watchlists",
  "admin_activity_logs",
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

function hasDesktopCloudPasswordLock(source: string | null): boolean {
  const helper = pythonMethodSource(source, "_hash_cloud_local_password_lock");
  const upsert = pythonMethodSource(source, "_upsert_local_user_from_supabase");
  const changePassword = pythonMethodSource(source, "change_password");
  const resetPassword = pythonMethodSource(source, "reset_password");

  return (
    includesEvery(helper, [
      "def _hash_cloud_local_password_lock(self)",
      "return self.hash_password(secrets.token_urlsafe(48))",
    ]) &&
    includesEvery(upsert, [
      "def _upsert_local_user_from_supabase(",
      "password_hash = self._hash_cloud_local_password_lock()",
      "user.password_hash = password_hash",
    ]) &&
    !upsert.includes("self.hash_password(password)") &&
    includesEvery(changePassword, [
      "self.supabase_service.update_current_user_password",
      "user.password_hash = self._hash_cloud_local_password_lock()",
      "user.password_hash = self.hash_password(new_password)",
    ]) &&
    includesEvery(resetPassword, [
      "if str(getattr(user, 'cloud_user_id', '') or '').strip():",
      "user.password_hash = self._hash_cloud_local_password_lock()",
      "user.password_hash = self.hash_password(new_password)",
    ])
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
      "self.clear_supabase_session_file()",
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
  return (
    includesEvery(source, [
      "def upsert_app_profile(",
      "/rest/v1/rpc/update_my_app_profile_v2",
      "fetch_app_profile(token, cloud_user_id)",
      "p_expected_profile_version",
      "_validate_versioned_profile_receipt",
      'set(row) != {"user_id", "profile_version", "updated_at"}',
      "expected_version + 1",
    ]) &&
    !source.includes('"/rest/v1/rpc/update_my_app_profile",') &&
    !source.includes('"profile_photo_path": "p_profile_photo_path"') &&
    !source.includes('"app_passcode_hash"')
  );
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
  return new RegExp(`\\bcreate table (?:if not exists )?public\\.${escapedTable}\\s*\\(`).test(
    normalized,
  );
}

/**
 * Legacy desktop-owned v1 signature, reproduced verbatim. The portal never calls
 * it and never reads or writes app_profiles.profile_photo_path, but the column
 * and this argument list are pre-existing desktop data contracts: the check only
 * confirms the legacy function is still retained unchanged.
 */
const PROFILE_V1_ARGUMENT_CONTRACT = [
  "p_first_name text default null",
  "p_last_name text default null",
  "p_phone text default null",
  "p_country text default null",
  "p_timezone text default null",
  "p_default_currency text default null",
  "p_profile_photo_path text default null",
  "p_notify_price_alerts boolean default null",
  "p_notify_portfolio_moves boolean default null",
  "p_notify_news_digest boolean default null",
  "p_data_refresh_rate text default null",
  "p_theme_preference text default null",
  "p_two_factor_enabled boolean default null",
].join(",");

const PROFILE_V2_ARGUMENT_CONTRACT = [
  "p_expected_profile_version bigint",
  "p_first_name text default null",
  "p_last_name text default null",
  "p_phone text default null",
  "p_country text default null",
  "p_timezone text default null",
  "p_default_currency text default null",
  "p_notify_price_alerts boolean default null",
  "p_notify_portfolio_moves boolean default null",
  "p_notify_news_digest boolean default null",
  "p_data_refresh_rate text default null",
  "p_theme_preference text default null",
  "p_two_factor_enabled boolean default null",
].join(",");

const PROFILE_V2_TYPE_SIGNATURE = [
  "bigint",
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
  "boolean",
  "boolean",
  "boolean",
  "text",
  "text",
  "boolean",
].join(",");

const PROFILE_V2_RECEIPT_CONTRACT = [
  "user_id uuid",
  "profile_version bigint",
  "updated_at timestamp with time zone",
].join(",");

const PROFILE_V2_FIELD_MUTATION_CONTRACT = [
  "first_name = case when p_first_name is null then profile.first_name else pg_catalog.btrim(p_first_name) end",
  "last_name = case when p_last_name is null then profile.last_name else pg_catalog.btrim(p_last_name) end",
  "phone = case when p_phone is null then profile.phone else pg_catalog.btrim(p_phone) end",
  "country = case when p_country is null then profile.country else pg_catalog.btrim(p_country) end",
  "timezone = case when p_timezone is null then profile.timezone else pg_catalog.btrim(p_timezone) end",
  "default_currency = case when p_default_currency is null then profile.default_currency else pg_catalog.upper(pg_catalog.btrim(p_default_currency)) end",
  "notify_price_alerts = coalesce(p_notify_price_alerts, profile.notify_price_alerts)",
  "notify_portfolio_moves = coalesce(p_notify_portfolio_moves, profile.notify_portfolio_moves)",
  "notify_news_digest = coalesce(p_notify_news_digest, profile.notify_news_digest)",
  "data_refresh_rate = case when p_data_refresh_rate is null then profile.data_refresh_rate else pg_catalog.btrim(p_data_refresh_rate) end",
  "theme_preference = case when p_theme_preference is null then profile.theme_preference else pg_catalog.lower(pg_catalog.btrim(p_theme_preference)) end",
  "two_factor_enabled = coalesce(p_two_factor_enabled, profile.two_factor_enabled)",
  "updated_at = pg_catalog.now()",
] as const;

function stripSqlComments(source: string): string {
  let result = "";
  let index = 0;
  let quote: "single" | "double" | null = null;

  while (index < source.length) {
    const current = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (quote === "single") {
      result += current;
      if (current === "'" && next === "'") {
        result += next;
        index += 2;
        continue;
      }
      if (current === "'") quote = null;
      index += 1;
      continue;
    }
    if (quote === "double") {
      result += current;
      if (current === '"' && next === '"') {
        result += next;
        index += 2;
        continue;
      }
      if (current === '"') quote = null;
      index += 1;
      continue;
    }
    if (current === "'") {
      quote = "single";
      result += current;
      index += 1;
      continue;
    }
    if (current === '"') {
      quote = "double";
      result += current;
      index += 1;
      continue;
    }
    if (current === "-" && next === "-") {
      index += 2;
      while (index < source.length && source[index] !== "\n") index += 1;
      result += " ";
      continue;
    }
    if (current === "/" && next === "*") {
      index += 2;
      let depth = 1;
      while (index < source.length && depth > 0) {
        if (source[index] === "/" && source[index + 1] === "*") {
          depth += 1;
          index += 2;
        } else if (source[index] === "*" && source[index + 1] === "/") {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      result += " ";
      continue;
    }
    result += current;
    index += 1;
  }

  return result;
}

function normalizeSql(source: string): string {
  return stripSqlComments(source).toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeSqlList(source: string): string {
  return normalizeSql(source).replace(/\s*,\s*/g, ",");
}

function compactSql(source: string): string {
  return normalizeSql(source).replace(/\s+/g, "");
}

type ProfileV2Definition = {
  argumentsSource: string;
  receiptSource: string;
  body: string;
};

function extractProfileV2Definitions(source: string): ProfileV2Definition[] {
  const pattern =
    /\bcreate\s+(?:or\s+replace\s+)?function\s+public\.update_my_app_profile_v2\s*\(([\s\S]*?)\)\s*returns\s+table\s*\(([\s\S]*?)\)\s*language\s+plpgsql\s+security\s+definer\s+set\s+search_path\s*=\s*''\s+as\s+(\$[a-z0-9_]*\$)([\s\S]*?)\3\s*;/g;
  return [...source.matchAll(pattern)].map((match) => ({
    argumentsSource: match[1] ?? "",
    receiptSource: match[2] ?? "",
    body: match[4] ?? "",
  }));
}

/**
 * Compare observed migration evidence to the exact reviewed manifest. The gate is
 * fail-closed: absent evidence, a different count, a reordered or renamed file, a
 * duplicate entry, and any digest mismatch all block the source gate. No partial
 * or normalized comparison is accepted.
 */
function migrationIntegrityViolations(observed: readonly MigrationArtifact[] | null): string[] {
  const expected = DESKTOP_SUPABASE_MIGRATION_ARTIFACTS;
  if (observed === null) {
    return ["Desktop migration artifact evidence is unavailable or incomplete."];
  }

  const violations: string[] = [];
  if (observed.length !== expected.length) {
    violations.push(
      `Expected exactly ${expected.length} migration artifacts, observed ${observed.length}.`,
    );
  }

  const seen = new Set<string>();
  for (const artifact of observed) {
    if (seen.has(artifact.filename)) {
      violations.push(`Duplicate migration artifact: ${artifact.filename}`);
    }
    seen.add(artifact.filename);
  }

  expected.forEach((expectedArtifact, index) => {
    const actual = observed[index];
    if (!actual) {
      violations.push(
        `Missing migration artifact at position ${index + 1}: ${expectedArtifact.filename}`,
      );
      return;
    }
    if (actual.filename !== expectedArtifact.filename) {
      violations.push(
        `Migration order mismatch at position ${index + 1}: expected ${expectedArtifact.filename}, observed ${actual.filename}`,
      );
      return;
    }
    if (actual.sha256 !== expectedArtifact.sha256) {
      violations.push(
        `Migration digest mismatch for ${expectedArtifact.filename}: expected ${expectedArtifact.sha256}, observed ${actual.sha256}`,
      );
    }
  });

  for (const artifact of observed) {
    if (!expected.some((expectedArtifact) => expectedArtifact.filename === artifact.filename)) {
      violations.push(`Unexpected migration artifact: ${artifact.filename}`);
    }
  }

  return violations;
}

/**
 * Untrusted defense-in-depth structure checks. These regular expressions can
 * only show that reviewed constructs are present; they are not evidence that
 * arbitrary later SQL is safe. Authoritative source integrity comes from the
 * exact per-migration digests in supabase.migration-integrity.
 */
function profileContractMissingEvidence(schema: string | null): string[] {
  if (schema === null) return ["Desktop Supabase contract source is unavailable."];

  const source = normalizeSql(schema);
  const missing: string[] = [];

  if (
    !/\balter\s+table\s+public\.app_profiles\s+add\s+column\s+profile_version\s+bigint\s+not\s+null\s+default\s+1\s*;/.test(
      source,
    )
  ) {
    missing.push("Missing additive profile_version bigint NOT NULL DEFAULT 1 column.");
  }
  if (
    !/\balter\s+table\s+public\.app_profiles\s+add\s+constraint\s+app_profiles_profile_version_check\s+check\s*\(\s*profile_version\s*>\s*0\s*\)\s*;/.test(
      source,
    )
  ) {
    missing.push("Missing positive app_profiles_profile_version_check constraint.");
  }

  const incrementFunction =
    /\bcreate\s+function\s+public\.increment_app_profile_version\s*\(\s*\)\s*returns\s+trigger\s+language\s+plpgsql\s+set\s+search_path\s*=\s*''\s+as\s+(\$[a-z0-9_]*\$)([\s\S]*?)\1\s*;/.exec(
      source,
    );
  if (
    !incrementFunction ||
    !/\bnew\.profile_version\s*:=\s*old\.profile_version\s*\+\s*1\s*;/.test(
      incrementFunction[2] ?? "",
    ) ||
    !/\breturn\s+new\s*;/.test(incrementFunction[2] ?? "")
  ) {
    missing.push("Missing exact increment_app_profile_version old-plus-one trigger function.");
  }
  if (
    !/\bcreate\s+trigger\s+trg_app_profiles_increment_version\s+before\s+update\s+on\s+public\.app_profiles\s+for\s+each\s+row\s+execute\s+function\s+public\.increment_app_profile_version\s*\(\s*\)\s*;/.test(
      source,
    )
  ) {
    missing.push("Missing unconditional every-UPDATE profile version trigger.");
  }

  const v1Definitions = [
    ...source.matchAll(
      /\bcreate\s+(?:or\s+replace\s+)?function\s+public\.update_my_app_profile\s*\(([\s\S]*?)\)\s*returns\s+public\.app_profiles\b/g,
    ),
  ];
  if (
    !v1Definitions.some(
      (definition) => normalizeSqlList(definition[1] ?? "") === PROFILE_V1_ARGUMENT_CONTRACT,
    )
  ) {
    missing.push("Missing retained 13-argument update_my_app_profile v1 function signal.");
  }

  const v2Definitions = extractProfileV2Definitions(source);
  const v2 = v2Definitions.length === 1 ? v2Definitions[0] : null;
  if (
    !v2 ||
    normalizeSqlList(v2.argumentsSource) !== PROFILE_V2_ARGUMENT_CONTRACT ||
    normalizeSqlList(v2.receiptSource) !== PROFILE_V2_RECEIPT_CONTRACT
  ) {
    missing.push(
      "Missing exact security-definer update_my_app_profile_v2 identity and minimal three-column receipt.",
    );
  }

  const v2Body = v2 ? normalizeSql(v2.body) : "";
  const compactV2Body = compactSql(v2Body);
  if (
    !/\bcaller_user_id\s*:=\s*auth\.uid\s*\(\s*\)\s*;/.test(v2Body) ||
    !/\bif\s+caller_user_id\s+is\s+null\s+then\s+raise\s+exception\s+'authentication required'\s+using\s+errcode\s*=\s*'42501'\s*;\s+end\s+if\s*;/.test(
      v2Body,
    ) ||
    !/\bif\s+not\s+public\.app_is_active\s*\(\s*\)\s+then\s+raise\s+exception\s+'active account required'\s+using\s+errcode\s*=\s*'42501'\s*;\s+end\s+if\s*;/.test(
      v2Body,
    ) ||
    !/\bwhere\s+profile\.user_id\s*=\s*caller_user_id\s+and\s+profile\.is_active\s+is\s+true\b/.test(
      v2Body,
    )
  ) {
    missing.push("Missing v2 caller identity, active-account, or owner-bound UPDATE predicate.");
  }
  if (
    !/\bprofile\.profile_version\s*=\s*p_expected_profile_version\b/.test(v2Body) ||
    !/\bp_expected_profile_version\s+is\s+null\s+or\s+p_expected_profile_version\s*<=\s*0\b/.test(
      v2Body,
    ) ||
    !/\bget\s+diagnostics\s+affected_rows\s*=\s*row_count\s*;/.test(v2Body) ||
    !/\bif\s+affected_rows\s*=\s*0\s+then\b/.test(v2Body) ||
    !/\bif\s+not\s+exists\s*\(\s*select\s+1\s+from\s+public\.app_profiles\s+profiles\s+where\s+profiles\.user_id\s*=\s*caller_user_id\s+and\s+profiles\.is_active\s+is\s+true\s*\)\s+then\s+raise\s+exception\s+'active account required'\s+using\s+errcode\s*=\s*'42501'\s*;\s+end\s+if\s*;/.test(
      v2Body,
    ) ||
    !/\braise\s+exception\s+'profile version is stale'\s+using\s+errcode\s*=\s*'40001'\s*;/.test(
      v2Body,
    )
  ) {
    missing.push("Missing v2 positive-token CAS and exact SQLSTATE 40001 stale contract.");
  }
  if (
    PROFILE_V2_FIELD_MUTATION_CONTRACT.some(
      (fieldMutation) => !compactV2Body.includes(compactSql(fieldMutation)),
    )
  ) {
    missing.push("Missing exact v2 profile and preference field mutation mappings.");
  }
  if (
    !/\breturning\s+profile\.user_id\s*,\s*profile\.profile_version\s*,\s*profile\.updated_at\s*;/.test(
      v2Body,
    )
  ) {
    missing.push("Missing v2 minimal committed profile mutation receipt.");
  }

  const exactRevoke = compactSql(
    `revoke all on function public.update_my_app_profile_v2(${PROFILE_V2_TYPE_SIGNATURE}) from public, anon, authenticated, service_role;`,
  );
  const exactGrant = compactSql(
    `grant execute on function public.update_my_app_profile_v2(${PROFILE_V2_TYPE_SIGNATURE}) to authenticated;`,
  );
  const v2AclStatements = [
    ...source.matchAll(
      /\b(?:grant|revoke)\s+(?:all(?:\s+privileges)?|execute)\s+on\s+function\s+public\.update_my_app_profile_v2\s*\(([^)]*)\)\s+(?:to|from)\s+[^;]+;/g,
    ),
  ]
    .filter((statement) => normalizeSqlList(statement[1] ?? "") === PROFILE_V2_TYPE_SIGNATURE)
    .map((statement) => compactSql(statement[0]));
  if (
    v2AclStatements.length !== 2 ||
    !v2AclStatements.includes(exactRevoke) ||
    !v2AclStatements.includes(exactGrant)
  ) {
    missing.push("Missing exact authenticated-only v2 EXECUTE ACL statement set.");
  }

  return missing;
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

  checks.push(
    check(
      "desktop.public-cloud-contract",
      "desktop",
      includesEvery(snapshot.desktopEnvironmentExample, [
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
        "QT_AUTH_API_ENDPOINT",
      ])
        ? "pass"
        : "blocked",
      "Desktop documents its public Supabase and Azure endpoint contract.",
    ),
  );
  checks.push(
    check(
      "desktop.legacy-pin-metadata",
      "desktop",
      includesAny(snapshot.desktopAuthService, ["app_passcode_hash"]) ||
        includesAny(snapshot.desktopAzureFunction, ["app_passcode_hash"]) ||
        includesAny(snapshot.desktopSupabaseSchema, ["app_passcode_hash"])
        ? "warning"
        : "pass",
      "Legacy cloud PIN metadata must remain blocked from portal contracts and be removed only after desktop migration.",
    ),
  );
  checks.push(
    check(
      "desktop.versioned-profile-writer",
      "desktop",
      hasDesktopVersionedProfileWriter(snapshot.desktopSupabaseService) ? "pass" : "blocked",
      hasDesktopVersionedProfileWriter(snapshot.desktopSupabaseService)
        ? "Desktop profile and preference writes use the versioned profile RPC and exact minimal receipts."
        : "Desktop profile and preference writes must migrate from the retained v1 profile RPC before it can be revoked.",
    ),
  );
  checks.push(
    check(
      "desktop.cloud-password-lock",
      "desktop",
      hasDesktopCloudPasswordLock(snapshot.desktopAuthService) ? "pass" : "blocked",
      hasDesktopCloudPasswordLock(snapshot.desktopAuthService)
        ? "Desktop cloud-auth password writes fill the local password column with a random lock hash, not the reusable cloud password."
        : "Desktop cloud-auth paths must stop storing reusable cloud-password verifiers locally.",
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

  const missingSchemaObjects = REQUIRED_SCHEMA_OBJECTS.filter(
    (table) => !hasSchemaTable(snapshot.desktopSupabaseSchema, table),
  );
  checks.push(
    check(
      "supabase.current-schema",
      "supabase",
      missingSchemaObjects.length === 0 ? "pass" : "blocked",
      missingSchemaObjects.length === 0
        ? "Current identity, profile, role, watchlist, and audit tables are represented in source control."
        : "Required current Supabase tables are missing from the checked-in schema.",
      missingSchemaObjects.map((table) => `Missing table: ${table}`),
    ),
  );

  const futureTables = ["account_sessions", "auth_events"];
  const missingFutureTables = futureTables.filter(
    (table) => !hasSchemaTable(snapshot.desktopSupabaseSchema, table),
  );
  checks.push(
    check(
      "supabase.unified-sessions",
      "supabase",
      missingFutureTables.length === 0 ? "pass" : "warning",
      missingFutureTables.length === 0
        ? "Unified session and authentication event tables are represented in source control."
        : "Unified session and authentication event migrations are not implemented yet.",
      missingFutureTables.map((table) => `Planned table absent: ${table}`),
    ),
  );

  const hasOwnerRole = /role\s+in\s*\([^)]*['"]owner['"]/i.test(
    snapshot.desktopSupabaseSchema ?? "",
  );
  checks.push(
    check(
      "supabase.owner-role",
      "supabase",
      hasOwnerRole ? "pass" : "warning",
      hasOwnerRole
        ? "Canonical role constraint includes Owner."
        : "Current canonical role constraint does not include Owner.",
    ),
  );

  const migrationIntegrityFindings = migrationIntegrityViolations(
    snapshot.desktopSupabaseMigrations,
  );
  checks.push(
    check(
      "supabase.migration-integrity",
      "supabase",
      migrationIntegrityFindings.length === 0 ? "pass" : "blocked",
      migrationIntegrityFindings.length === 0
        ? `All ${DESKTOP_SUPABASE_MIGRATION_ARTIFACTS.length} desktop migrations match their exact reviewed SHA-256 digests in applied order.`
        : "Desktop migration artifacts do not match the exact reviewed digests and require manual review.",
      migrationIntegrityFindings.length === 0
        ? [
            "Digests are computed over raw migration bytes; any byte drift blocks this gate.",
            "Structural SQL checks are untrusted defense-in-depth only.",
          ]
        : migrationIntegrityFindings,
    ),
  );

  const missingProfileContract = profileContractMissingEvidence(snapshot.desktopSupabaseSchema);
  checks.push(
    check(
      "supabase.profile-contract",
      "supabase",
      missingProfileContract.length === 0 ? "pass" : "blocked",
      missingProfileContract.length === 0
        ? "Profile versioning and the v1/v2 profile mutation contracts are structurally represented in source control."
        : "Profile mutation source contracts are missing or structurally incomplete.",
      missingProfileContract,
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

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    mode: network.length > 0 ? "network" : "offline",
    checks,
    environment,
    network,
    counts,
    sourceReady: counts.blocked === 0,
    stagingReady: false,
    productionReady: false,
  };
}

export function preflightExitCode(report: PreflightReport, strictProduction = false): 0 | 1 {
  return report.counts.blocked > 0 || (strictProduction && !report.productionReady) ? 1 : 0;
}
