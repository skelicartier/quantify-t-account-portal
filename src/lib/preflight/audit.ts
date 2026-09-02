import type {
  EnvironmentPresence,
  NetworkProbe,
  PreflightCheck,
  PreflightReport,
  PreflightStatus,
  RepositorySnapshot,
} from "@/lib/preflight/model";

const REQUIRED_PUBLIC_ENVIRONMENT = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "QT_ACCOUNT_API_URL",
] as const;

const FORBIDDEN_PORTAL_ENVIRONMENT = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "AZURE_STORAGE_CONNECTION_STRING",
  "BREVO_API_KEY",
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
        ? "Portal callback provenance, recovery authorization, reset ordering, and challenge replay controls are structurally represented per file."
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
