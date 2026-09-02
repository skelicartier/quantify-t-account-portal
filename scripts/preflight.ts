import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildPreflightReport, preflightExitCode } from "@/lib/preflight/audit";
import {
  DESKTOP_SUPABASE_MIGRATION_FILENAMES,
  type NetworkProbe,
  type RepositorySnapshot,
} from "@/lib/preflight/model";
import {
  analyzePortalAuthLifecycle,
  analyzePortalSecurityHeaders,
} from "@/lib/preflight/source-analysis";
import { renderPreflightMarkdown } from "@/lib/preflight/report";
import nextConfig from "../next.config";

const portalRoot = process.cwd();
const projectsRoot = resolve(portalRoot, "..");
const desktopRoot = resolve(
  process.env.QT_DESKTOP_PROJECT_PATH || resolve(projectsRoot, "Quantify Terminal"),
);
const marketingRoot = resolve(projectsRoot, "Quantify Terminal Website");

async function readKnownFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readDesktopSupabaseContract(): Promise<string | null> {
  const knownPaths = [
    resolve(desktopRoot, "src/database/supabase_schema.sql"),
    ...DESKTOP_SUPABASE_MIGRATION_FILENAMES.map((filename) =>
      resolve(desktopRoot, "supabase/migrations", filename),
    ),
  ];
  const sources = await Promise.all(knownPaths.map((path) => readKnownFile(path)));
  if (sources.some((source) => source === null)) return null;
  return (sources as string[]).join("\n\n");
}

async function collectSnapshot(): Promise<RepositorySnapshot> {
  const [confirmRoute, resetAction, turnstileField] = await Promise.all([
    readKnownFile(resolve(portalRoot, "src/app/auth/confirm/route.ts")),
    readKnownFile(resolve(portalRoot, "src/app/reset-password/actions.ts")),
    readKnownFile(resolve(portalRoot, "src/components/auth/turnstile-field.tsx")),
  ]);
  const headerRules = await nextConfig.headers?.();

  return {
    portalPackageJson: await readKnownFile(resolve(portalRoot, "package.json")),
    portalEnvironmentExample: await readKnownFile(resolve(portalRoot, ".env.example")),
    portalAuthLifecycleEvidence: analyzePortalAuthLifecycle({
      confirmRoute,
      resetAction,
      turnstileField,
    }),
    portalSecurityEvidence: analyzePortalSecurityHeaders(headerRules ?? null),
    desktopEnvironmentExample: await readKnownFile(resolve(desktopRoot, ".env.example")),
    desktopSupabaseSchema: await readDesktopSupabaseContract(),
    desktopAuthService: await readKnownFile(resolve(desktopRoot, "src/services/auth_service.py")),
    desktopAzureFunction: await readKnownFile(
      resolve(desktopRoot, "cloud/azure/update_deploy_function/function_app.py"),
    ),
    desktopAzureDocumentation: await readKnownFile(resolve(desktopRoot, "docs/AZURE_SETUP.md")),
    desktopAzureRequirements: await readKnownFile(
      resolve(desktopRoot, "cloud/azure/update_deploy_function/requirements.txt"),
    ),
    marketingVercelConfig: await readKnownFile(resolve(marketingRoot, "vercel.json")),
    marketingStylesheet: await readKnownFile(resolve(marketingRoot, "style.css")),
    accountInfrastructureDefinition: await readKnownFile(
      resolve(desktopRoot, "cloud/azure/account_function/infra/main.bicep"),
    ),
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

async function main() {
  const useNetwork = process.argv.includes("--network");
  const outputJson = process.argv.includes("--json");
  const strictProduction = process.argv.includes("--strict-production");
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
