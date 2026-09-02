import {
  auditRepositories,
  buildPreflightReport,
  extractAzureRoutes,
  preflightExitCode,
} from "@/lib/preflight/audit";
import {
  DESKTOP_SUPABASE_MIGRATION_FILENAMES,
  type RepositorySnapshot,
} from "@/lib/preflight/model";
import { renderPreflightMarkdown } from "@/lib/preflight/report";
import {
  analyzePortalAuthLifecycle,
  analyzePortalSecurityHeaders,
} from "@/lib/preflight/source-analysis";

const completeSnapshot: RepositorySnapshot = {
  portalPackageJson: JSON.stringify({ dependencies: { next: "16.3.4" } }),
  portalEnvironmentExample: [
    "NEXT_PUBLIC_SITE_URL=https://account.example.invalid",
    "NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=replace-with-publishable-key",
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY=replace-with-site-key",
    "QT_ACCOUNT_API_URL=https://api.example.invalid",
    "QT_MARKETING_SITE_URL=https://www.example.invalid",
    "QT_DESKTOP_PROJECT_PATH=../Quantify Terminal",
  ].join("\n"),
  portalAuthLifecycleEvidence: {
    callbackUsesTrustedRedirectType: true,
    callbackIssuesRecoveryAuthorization: true,
    callbackClearsRejectedExchange: true,
    resetRequiresVerifiedSession: true,
    resetConsumesAuthorizationBeforeUpdate: true,
    turnstileResetsAfterSubmission: true,
  },
  portalSecurityEvidence: {
    enforcedChallengeCompatibleCsp: true,
    exactNoStoreRoutes: true,
    noStoreRoutes: [
      "/login",
      "/signup",
      "/forgot-password",
      "/reset-password",
      "/account/:path*",
      "/admin/:path*",
      "/auth/:path*",
    ],
  },
  desktopEnvironmentExample: "SUPABASE_URL SUPABASE_ANON_KEY QT_AUTH_API_ENDPOINT",
  desktopSupabaseSchema: `
    create table if not exists public.app_profiles (id uuid);
    create table if not exists public.app_user_profiles (id uuid);
    create table if not exists public.app_roles (role text);
    create table if not exists public.watchlists (id uuid);
    create table if not exists public.admin_activity_logs (id uuid);
    alter table public.app_roles add constraint app_roles_role_check
      check (role in ('owner', 'admin', 'support', 'user'));
    create table public.account_sessions (id uuid);
    create table public.auth_events (id uuid);
  `,
  desktopAuthService: "",
  desktopAzureFunction: [
    "Access-Control-Allow-Origin: https://account.quantifyterminal.com",
    ...[
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
    ].map((route) => `@app.route(route=\"${route}\")`),
  ].join("\n"),
  desktopAzureDocumentation:
    "rg-quantify-terminal-prod func-quantify-updates-prod qtterminalprod001",
  desktopAzureRequirements: "azure-functions==1.20.0\nazure-storage-blob==12.22.0\n",
  marketingVercelConfig: "{}",
  marketingStylesheet: ":root { --bg: #000; --accent: orange; --text: white; }",
  accountInfrastructureDefinition: "resource accountFunction 'Microsoft.Web/sites@2024-04-01' = {}",
};

const validEnvironment = {
  NEXT_PUBLIC_SITE_URL: "https://account.quantifyterminal.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_safe_value",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-public-value",
  QT_ACCOUNT_API_URL: "https://account-api.azurewebsites.net/api/v1",
};

describe("preflight audit", () => {
  it("pins the ordered desktop migration allow-list without discovery patterns", () => {
    expect(DESKTOP_SUPABASE_MIGRATION_FILENAMES).toStrictEqual([
      "20260902000000_local_baseline.sql",
      "20260902000050_adoption_preflight.sql",
      "20260902000100_immutable_identity.sql",
      "20260902000200_canonical_rbac_provisioning.sql",
      "20260902000300_account_sessions.sql",
      "20260902000400_auth_events.sql",
      "20260902000500_rls_grants_hardening.sql",
      "20260902000600_contract_validation.sql",
    ]);
    expect(DESKTOP_SUPABASE_MIGRATION_FILENAMES.every((name) => !/[*?{}[\]]/.test(name))).toBe(
      true,
    );
  });

  it("recognizes the complete repository and environment contract", () => {
    const report = buildPreflightReport({
      snapshot: completeSnapshot,
      environment: validEnvironment,
      generatedAt: "2026-09-02T00:00:00.000Z",
    });

    expect(report.counts.blocked).toBe(0);
    expect(report.counts.warning).toBe(0);
    expect(report.sourceReady).toBe(true);
    expect(report.stagingReady).toBe(false);
    expect(report.productionReady).toBe(false);
    expect(report.checks.find(({ id }) => id === "portal.auth-lifecycle")?.status).toBe("pass");
    expect(report.checks.find(({ id }) => id === "portal.credential-security")?.status).toBe(
      "pass",
    );
    expect(report.checks.find(({ id }) => id === "supabase.current-schema")?.status).toBe("pass");
    expect(report.checks.find(({ id }) => id === "supabase.unified-sessions")?.status).toBe("pass");
    expect(report.checks.find(({ id }) => id === "supabase.owner-role")?.status).toBe("pass");
  });

  it("blocks incomplete structural lifecycle or evaluated header evidence", () => {
    const checks = auditRepositories({
      ...completeSnapshot,
      portalAuthLifecycleEvidence: {
        ...completeSnapshot.portalAuthLifecycleEvidence!,
        callbackUsesTrustedRedirectType: false,
      },
      portalSecurityEvidence: {
        enforcedChallengeCompatibleCsp: true,
        exactNoStoreRoutes: false,
        noStoreRoutes: ["/login", "/signup"],
      },
    });

    expect(checks.find(({ id }) => id === "portal.auth-lifecycle")?.status).toBe("blocked");
    expect(checks.find(({ id }) => id === "portal.credential-security")?.status).toBe("blocked");
  });

  it("does not accept a query-only recovery branch as trusted callback provenance", () => {
    const evidence = analyzePortalAuthLifecycle({
      confirmRoute: `
        async function clearRejectedExchange() {
          await clearPortalSupabaseAuthCookies();
          await clearRecoveryAuthorization();
        }
        async function GET() {
          const result = await supabase.auth.exchangeCodeForSession(parsed.data.code);
          const destination = parsed.data.flow === "recovery" ? "/reset-password" : "/account";
          await issueRecoveryAuthorization({ userId: result.data.user.id });
          await clearRejectedExchange();
          return destination;
        }
      `,
      resetAction: `async function resetPassword() { await getSession(); await getUser(session.access_token); const authorized = await consumeRecoveryAuthorization(); if (!authorized) return; await updateUser(); }`,
      turnstileField: `function TurnstileField() { const completed = wasDisabled.current && !disabled; if (completed) window.turnstile.reset(widgetId); }`,
    });

    expect(evidence?.callbackUsesTrustedRedirectType).toBe(false);
  });

  it("does not accept an ordinary-session password update without marker consumption", () => {
    const evidence = analyzePortalAuthLifecycle({
      confirmRoute: `
        async function clearRejectedExchange() {
          await clearPortalSupabaseAuthCookies();
          await clearRecoveryAuthorization();
        }
        async function GET() {
          const result = await supabase.auth.exchangeCodeForSession(parsed.data.code);
          const redirectType = "redirectType" in result.data ? result.data.redirectType : undefined;
          const destination = resolveTrustedAuthDestination(parsed.data.flow, redirectType);
          await issueRecoveryAuthorization({ userId: result.data.user.id, accessToken: result.data.session.access_token, secure: true });
          await clearRejectedExchange();
          return destination;
        }
      `,
      resetAction: `async function resetPassword() { await getSession(); await getUser(session.access_token); await updateUser(); }`,
      turnstileField: `function TurnstileField() { const completed = wasDisabled.current && !disabled; if (completed) window.turnstile.reset(widgetId); }`,
    });

    expect(evidence?.resetConsumesAuthorizationBeforeUpdate).toBe(false);
  });

  it("blocks evaluated headers when one credential route lacks no-store", () => {
    const sources = [
      "/login",
      "/signup",
      "/forgot-password",
      "/reset-password",
      "/account/:path*",
      "/admin/:path*",
    ];
    const evidence = analyzePortalSecurityHeaders([
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "script-src 'self' https://challenges.cloudflare.com; connect-src 'self' https://*.supabase.co",
          },
        ],
      },
      ...sources.map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      })),
    ]);

    expect(evidence?.enforcedChallengeCompatibleCsp).toBe(true);
    expect(evidence?.exactNoStoreRoutes).toBe(false);
    expect(evidence?.noStoreRoutes).not.toContain("/auth/:path*");
  });

  it("blocks environment names outside the checked-in allow-list", () => {
    const checks = auditRepositories({
      ...completeSnapshot,
      portalEnvironmentExample: `${completeSnapshot.portalEnvironmentExample}\nSUPABASE_SERVICE_ROLE_KEY=forbidden`,
    });

    expect(checks.find(({ id }) => id === "portal.environment-contract")?.status).toBe("blocked");
  });

  it("blocks dependency strings that only start with an exact-looking version", () => {
    const checks = auditRepositories({
      ...completeSnapshot,
      portalPackageJson: JSON.stringify({ dependencies: { next: "16.3.4 || >=17" } }),
    });

    expect(checks.find(({ id }) => id === "portal.dependencies")?.status).toBe("blocked");
  });

  it("blocks missing local contracts and reports future migration warnings", () => {
    const checks = auditRepositories({
      ...completeSnapshot,
      portalPackageJson: null,
      desktopSupabaseSchema: "create table if not exists public.app_profiles (id uuid);",
      accountInfrastructureDefinition: null,
    });

    expect(checks.some(({ status }) => status === "blocked")).toBe(true);
    expect(checks.find(({ id }) => id === "supabase.unified-sessions")?.status).toBe("warning");
  });

  it("detects wildcard CORS, legacy PIN metadata, and open Python ranges", () => {
    const checks = auditRepositories({
      ...completeSnapshot,
      desktopAzureFunction: `${completeSnapshot.desktopAzureFunction}\n\"Access-Control-Allow-Origin\": \"*\"\napp_passcode_hash`,
      desktopAzureRequirements: "azure-functions>=1.20.0",
    });

    expect(checks.find(({ id }) => id === "azure.wildcard-cors")?.status).toBe("warning");
    expect(checks.find(({ id }) => id === "desktop.legacy-pin-metadata")?.status).toBe("warning");
    expect(checks.find(({ id }) => id === "azure.dependency-pins")?.status).toBe("warning");
  });

  it("never serializes configured secret values", () => {
    const serviceRole = "service-role-value-that-must-never-appear";
    const report = buildPreflightReport({
      snapshot: completeSnapshot,
      environment: {
        ...validEnvironment,
        SUPABASE_SERVICE_ROLE_KEY: serviceRole,
      },
      generatedAt: "2026-09-02T00:00:00.000Z",
    });
    const serialized = JSON.stringify(report);
    const markdown = renderPreflightMarkdown(report);

    expect(report.productionReady).toBe(false);
    expect(serialized).not.toContain(serviceRole);
    expect(markdown).not.toContain(serviceRole);
    expect(markdown).toContain("SUPABASE_SERVICE_ROLE_KEY must not exist");
  });

  it("fails strict production preflight on warnings without weakening local source checks", () => {
    const report = buildPreflightReport({
      snapshot: completeSnapshot,
      environment: {},
      generatedAt: "2026-09-02T00:00:00.000Z",
    });

    expect(report.counts.blocked).toBe(0);
    expect(report.counts.warning).toBeGreaterThan(0);
    expect(preflightExitCode(report)).toBe(0);
    expect(preflightExitCode(report, true)).toBe(1);
  });

  it("extracts unique Azure decorator routes", () => {
    expect(
      extractAzureRoutes(
        '@app.route(route="health")\n@app.route(route="health")\n@app.route(route="me")',
      ),
    ).toEqual(["health", "me"]);
  });
});
