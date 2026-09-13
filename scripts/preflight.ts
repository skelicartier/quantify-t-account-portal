import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

// `@next/env` is CommonJS and exposes no named ESM export, so take the default and
// destructure. This is Next's own loader, which is the point: "the way Next does it" should
// be exact rather than a re-implementation that drifts from it.
import nextEnv from "@next/env";

import { buildPreflightReport, preflightExitCode } from "@/lib/preflight/audit";
import { type NetworkProbe, type RepositorySnapshot } from "@/lib/preflight/model";
import { ACCOUNT_API_MODULES, analyzeAccountApi } from "@/lib/preflight/account-api-analysis";
import { resolveDesktopRoot } from "@/lib/preflight/desktop-root";
import {
  analyzePortalAuthLifecycle,
  analyzePortalSecurityHeaders,
  SAME_ORIGIN_SERVER_ACTION_PATHS,
} from "@/lib/preflight/source-analysis";
import { renderPreflightMarkdown } from "@/lib/preflight/report";
import nextConfig from "../next.config";

const portalRoot = process.cwd();
const projectsRoot = resolve(portalRoot, "..");
const desktopRoot = resolveDesktopRoot(process.env, portalRoot);
const marketingRoot = resolve(projectsRoot, "Quantify Terminal Website");

async function readKnownFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * The checked-in Azure SQL schema: the base snapshot plus every migration applied after
 * it. A table added by a migration is as much part of the schema as one in the baseline
 * file, and reading only the baseline would report a migrated table as missing.
 */
async function readAzureSqlSchema(schemaRoot: string): Promise<string | null> {
  const base = await readKnownFile(resolve(schemaRoot, "azure_sql_schema.sql"));
  if (base === null) return null;
  let names: string[];
  try {
    names = await readdir(resolve(schemaRoot, "migrations"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return base;
    throw error;
  }
  const migrations = await Promise.all(
    names
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map(async (name) => (await readKnownFile(resolve(schemaRoot, "migrations", name))) ?? ""),
  );
  return [base, ...migrations].join("\n");
}

async function collectSnapshot(): Promise<RepositorySnapshot> {
  const [
    confirmRoute,
    resetAction,
    turnstileField,
    securityActions,
    loginActions,
    accountGuard,
    profileAction,
    preferencesAction,
    sessionQuery,
    sessionLifecycle,
    accountDal,
    adminAccess,
    actionOrigin,
  ] = await Promise.all([
    readKnownFile(resolve(portalRoot, "src/app/auth/confirm/route.ts")),
    readKnownFile(resolve(portalRoot, "src/app/reset-password/actions.ts")),
    readKnownFile(resolve(portalRoot, "src/components/auth/turnstile-field.tsx")),
    readKnownFile(resolve(portalRoot, "src/app/account/security/actions.ts")),
    readKnownFile(resolve(portalRoot, "src/app/login/actions.ts")),
    readKnownFile(resolve(portalRoot, "src/lib/dal/assurance-guard.ts")),
    readKnownFile(resolve(portalRoot, "src/app/account/profile/actions.ts")),
    readKnownFile(resolve(portalRoot, "src/app/account/preferences/actions.ts")),
    readKnownFile(resolve(portalRoot, "src/lib/dal/session-query.ts")),
    readKnownFile(resolve(portalRoot, "src/lib/account/session-lifecycle.ts")),
    readKnownFile(resolve(portalRoot, "src/lib/dal/account.ts")),
    readKnownFile(resolve(portalRoot, "src/lib/admin/access.ts")),
    readKnownFile(resolve(portalRoot, "src/lib/security/action-origin.ts")),
  ]);
  const serverActionSources = await Promise.all(
    SAME_ORIGIN_SERVER_ACTION_PATHS.map(
      async (path) => [path, await readKnownFile(resolve(portalRoot, path))] as const,
    ),
  );
  const accountApiRoot = resolve(desktopRoot, "cloud/azure/account_function");
  const accountApiModuleSources = await Promise.all(
    ACCOUNT_API_MODULES.map(
      async (name) =>
        [name, await readKnownFile(resolve(accountApiRoot, `account_api/${name}.py`))] as const,
    ),
  );
  const [accountApiFunctionApp, accountApiHostJson, accountApiRequirements] = await Promise.all([
    readKnownFile(resolve(accountApiRoot, "function_app.py")),
    readKnownFile(resolve(accountApiRoot, "host.json")),
    readKnownFile(resolve(accountApiRoot, "requirements.txt")),
  ]);
  const accountInfrastructureDefinition = await readKnownFile(
    resolve(accountApiRoot, "infra/main.bicep"),
  );
  const headerRules = await nextConfig.headers?.();

  return {
    portalPackageJson: await readKnownFile(resolve(portalRoot, "package.json")),
    portalEnvironmentExample: await readKnownFile(resolve(portalRoot, ".env.example")),
    portalAuthLifecycleEvidence: analyzePortalAuthLifecycle({
      confirmRoute,
      resetAction,
      turnstileField,
      securityActions,
      loginActions,
      accountGuard,
      profileAction,
      preferencesAction,
      sessionQuery,
      sessionLifecycle,
      accountDal,
      adminAccess,
      actionOrigin,
      serverActions: Object.fromEntries(serverActionSources),
    }),
    portalSecurityEvidence: analyzePortalSecurityHeaders(headerRules ?? null),
    desktopEnvironmentExample: await readKnownFile(resolve(desktopRoot, ".env.example")),
    azureSqlSchema: await readAzureSqlSchema(
      resolve(desktopRoot, "cloud/azure/account_function/schema"),
    ),
    desktopAuthService: await readKnownFile(resolve(desktopRoot, "src/services/auth_service.py")),
    desktopSupabaseService: await readKnownFile(
      resolve(desktopRoot, "src/services/supabase_service.py"),
    ),
    desktopAzureFunction: await readKnownFile(
      resolve(desktopRoot, "cloud/azure/update_deploy_function/function_app.py"),
    ),
    desktopAzureDocumentation: await readKnownFile(resolve(desktopRoot, "docs/AZURE_SETUP.md")),
    desktopAzureRequirements: await readKnownFile(
      resolve(desktopRoot, "cloud/azure/update_deploy_function/requirements.txt"),
    ),
    marketingVercelConfig: await readKnownFile(resolve(marketingRoot, "vercel.json")),
    marketingStylesheet: await readKnownFile(resolve(marketingRoot, "style.css")),
    accountInfrastructureDefinition,
    accountApiEvidence: analyzeAccountApi({
      functionApp: accountApiFunctionApp,
      hostJson: accountApiHostJson,
      requirements: accountApiRequirements,
      infrastructure: accountInfrastructureDefinition,
      modules: Object.fromEntries(accountApiModuleSources),
    }),
  };
}

function safeProbeTarget(name: string, rawValue: string | undefined): URL | null {
  const value = String(rawValue ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !isLocal) return null;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    if (name === "account-api" && !url.pathname.endsWith("/health")) {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/health`;
    }
    return url;
  } catch {
    return null;
  }
}

async function probe(name: string, value: string | undefined): Promise<NetworkProbe> {
  const target = safeProbeTarget(name, value);
  if (!target) {
    return {
      name,
      status: "warning",
      summary: `${name} has no safe HTTPS probe target configured.`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(target, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { Accept: "application/json,text/html;q=0.8" },
    });
    return {
      name,
      status: response.status < 500 ? "pass" : "warning",
      summary: `${name} returned HTTP ${response.status}; no credentials were sent.`,
    };
  } catch {
    return { name, status: "warning", summary: `${name} could not be reached safely.` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load the project's `.env` files the way Next does, and report which names arrived.
 *
 * Opt-in, because two things are both true. Reading `process.env` alone is a real bug: Next
 * loads `.env.local` and `.env.production.local`, `tsx` does not, so `npm run validate` was
 * checking the shell rather than the application's configuration — which is why the three
 * `environment.required.*` checks warn on a machine where those values are perfectly well
 * set. But `docs/STAGING_READINESS.md` states that offline preflight "never opens real
 * `.env` files", and making that false by default would change what the tool is, and make
 * its answer depend on which untracked files happen to sit beside it.
 *
 * `loadEnvConfig` is Next's own loader, so this is exact rather than an approximation of it.
 * Values are never printed: `summarizeEnvironment` reduces each name to
 * `{configured, placeholder, forbidden}` before anything reaches the report.
 */
function loadProjectEnv(): void {
  nextEnv.loadEnvConfig(portalRoot, false);
}

async function main() {
  const useNetwork = process.argv.includes("--network");
  const outputJson = process.argv.includes("--json");
  const strictProduction = process.argv.includes("--strict-production");
  if (process.argv.includes("--load-env")) loadProjectEnv();
  const network = useNetwork
    ? await Promise.all([
        probe("portal", process.env.NEXT_PUBLIC_SITE_URL),
        probe("marketing", process.env.QT_MARKETING_SITE_URL),
        probe("account-api", process.env.QT_ACCOUNT_API_URL),
      ])
    : [];

  const report = buildPreflightReport({
    snapshot: await collectSnapshot(),
    environment: process.env,
    network,
  });

  process.stdout.write(
    outputJson ? `${JSON.stringify(report, null, 2)}\n` : renderPreflightMarkdown(report),
  );
  process.exitCode = preflightExitCode(report, strictProduction);
}

void main();
