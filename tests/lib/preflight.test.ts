import {
  auditRepositories,
  buildPreflightReport,
  extractAzureRoutes,
  preflightExitCode,
} from "@/lib/preflight/audit";
import { type RepositorySnapshot } from "@/lib/preflight/model";
import { renderPreflightMarkdown } from "@/lib/preflight/report";
import {
  analyzePortalAuthLifecycle,
  analyzePortalSecurityHeaders,
  SAME_ORIGIN_SERVER_ACTION_PATHS,
} from "@/lib/preflight/source-analysis";

const AZURE_SQL_SCHEMA = `
CREATE TABLE dbo.app_users ([id] uniqueidentifier NOT NULL);
CREATE TABLE dbo.app_profiles (
    [user_id] uniqueidentifier NOT NULL,
    [profile_version] bigint NOT NULL DEFAULT ((1)),
    CONSTRAINT [CK_app_profiles_profile_version] CHECK ([profile_version]>(0))
);
CREATE TABLE dbo.app_roles (
    [role] nvarchar(20) NOT NULL DEFAULT ('user'),
    CONSTRAINT [CK_app_roles_role] CHECK ([role]='user' OR [role]='support' OR [role]='admin' OR [role]='owner')
);
CREATE TABLE dbo.account_sessions ([id] uniqueidentifier NOT NULL);
CREATE TABLE dbo.auth_events ([id] uniqueidentifier NOT NULL);
CREATE TABLE dbo.app_states ([id] uniqueidentifier NOT NULL);
CREATE TABLE dbo.app_user_profiles ([user_id] uniqueidentifier NOT NULL);
CREATE TABLE dbo.watchlists ([id] uniqueidentifier NOT NULL);
CREATE TABLE dbo.admin_activity_logs ([id] uniqueidentifier NOT NULL);
`;

const TASK7_CONFIRM_ROUTE = `
  async function GET(request) {
    const tokens = new URL(request.url).searchParams.getAll("token");
    const token = tokens.length === 1 ? tokens[0]?.trim() : "";
    if (!token || token.length > 4_096) return Response.redirect("/auth/confirmed?reason=invalid-confirm-link");
    try {
      const config = getAzureAuthConfig();
      await new AzureAuthClient(config.apiUrl).confirmEmail(token);
      return Response.redirect("/auth/confirmed");
    } catch {}
    return Response.redirect("/auth/confirmed?reason=invalid-confirm-link");
  }
`;

const TASK7_RESET_ACTION = `
  async function resetPassword() {
    const rawToken = formData.get("token");
    const token = typeof rawToken === "string" ? rawToken.trim() : "";
    if (!token || token.length > 4_096) return INVALID_RECOVERY_STATE;
    await requireSameOriginServerAction();
    const config = getAzureAuthConfig();
    const client = new AzureAuthClient(config.apiUrl);
    await client.resetPassword(token, parsed.data.password);
    await clearRecoveryAuthorization();
  }
`;

const TASK7_TURNSTILE_FIELD = `function TurnstileField() { const completed = wasDisabled.current && !disabled; if (completed) window.turnstile.reset(widgetId); }`;

const TASK7_SECURITY_ACTIONS = `
  export async function changePassword() {
    const { decision } = await requireMutationAssurance();
    if (decision !== "satisfied") return PASSWORD_SERVICE_ERROR;
    const azure = await createServerAzureClient();
    const verification = await verifyCurrentPassword(caller.email, parsed.data.currentPassword);
    await authClient.updatePassword(accessToken, parsed.data.password);
  }
  export async function changeEmail() {
    const { decision } = await requireMutationAssurance();
    if (decision !== "satisfied") return EMAIL_SERVICE_ERROR;
    const azure = await createServerAzureClient();
    const verification = await verifyCurrentPassword(caller.email, parsed.data.currentPassword);
    return EMAIL_SERVICE_ERROR; // Azure email-change confirmation is source-locked.
  }
  export async function startTotpEnrollment() {
    const { decision, assurance } = await requireMutationAssurance();
    if (decision !== "satisfied") return TOTP_SERVICE_ERROR;
    const azure = await createServerAzureClient();
    return TOTP_SERVICE_ERROR; // Azure TOTP enrollment is source-locked.
  }
  export async function confirmTotpEnrollment() {
    const { decision, assurance } = await requireMutationAssurance();
    if (decision !== "satisfied") return TOTP_SERVICE_ERROR;
    if (!assurance.unverifiedTotpFactorIds.includes(submitted.data.factorId)) return;
    const azure = await createServerAzureClient();
    return TOTP_SERVICE_ERROR; // Azure TOTP verification is source-locked.
  }
  export async function removeTotpFactor() {
    const { decision, assurance } = await requireMutationAssurance();
    if (decision !== "satisfied") return TOTP_SERVICE_ERROR;
    const azure = await createServerAzureClient();
    const verification = await verifyCurrentPassword(caller.email, submitted.data.currentPassword);
    return TOTP_SERVICE_ERROR; // Azure TOTP removal is source-locked.
  }
`;

const TASK7_PROFILE_ACTION = `
  export async function updateProfile() {
    const { decision } = await requireMutationAssurance();
    if (decision !== "satisfied") return SERVICE_ERROR;
    const azure = await createServerAzureClient();
    const user = await azure.getUser();
    const result = await updateAccountApiProfile(accessToken, {}, { idempotencyKey });
  }
`;

const TASK7_PREFERENCES_ACTION = `
  export async function updatePreferences() {
    const { decision } = await requireMutationAssurance();
    if (decision !== "satisfied") return SERVICE_ERROR;
    const azure = await createServerAzureClient();
    const user = await azure.getUser();
    const result = await updateAccountApiProfile(accessToken, {}, { idempotencyKey });
  }
`;

const TASK7_LOGIN_ACTIONS = `
  export async function login() {
    const azure = await createServerAzureClient();
    const { data, error } = await azure.signInWithPassword(email, password);
    if (!data?.session) return SERVICE_ERROR;
    await registerCurrentAccountApiSession(azure);
    redirect(parsed.data.nextPath);
  }
`;

const TASK7_ACCOUNT_GUARD = `
  export async function requireSatisfiedAssurance() {
    const assurance = await getCurrentAssurance();
    if (assurance.challengeRequired) redirect(MFA_CHALLENGE_NOTICE);
    return assurance;
  }
  export async function requireMutationAssurance() {
    const assurance = await getCurrentAssurance();
    return { decision: assuranceForMutation(assurance), assurance };
  }
`;

const TASK7_LIFECYCLE_SOURCES = {
  confirmRoute: TASK7_CONFIRM_ROUTE,
  resetAction: TASK7_RESET_ACTION,
  turnstileField: TASK7_TURNSTILE_FIELD,
  securityActions: TASK7_SECURITY_ACTIONS,
  loginActions: TASK7_LOGIN_ACTIONS,
  accountGuard: TASK7_ACCOUNT_GUARD,
  profileAction: TASK7_PROFILE_ACTION,
  preferencesAction: TASK7_PREFERENCES_ACTION,
  sessionQuery: `
    export const ACCOUNT_SESSIONS_ENDPOINT = "sessions";
    export const ACCOUNT_ACTIVITY_ENDPOINT = "activity";
    export async function loadAccountSessions(client) {
      const userId = await currentVerifiedUserId(client);
      const accessToken = client.getAccessToken();
      const rows = (await fetchAccountApiSessions(accessToken)).sessions;
      return mapAccountSessions(userId, rows, options);
    }
    export async function loadAccountActivityEvents(client) {
      const userId = await currentVerifiedUserId(client);
      const accessToken = client.getAccessToken();
      const rows = (await fetchAccountApiActivity(accessToken)).events;
      return mapAccountActivityEvents(userId, rows);
    }
  `,
  sessionLifecycle: `
    export async function registerCurrentAccountApiSession(supabase) {
      return postAccountApiJson("sessions/register", accessToken, {
        source: "portal",
        device_name: "Web portal",
      }, { idempotencyKey });
    }
    export async function heartbeatAccountApiSession(accessToken) {
      return postAccountApiJson("sessions/heartbeat", accessToken, {
        device_name: "Web portal",
      }, { idempotencyKey });
    }
    export async function heartbeatCurrentAccountApiSession(supabase) {
      return heartbeatAccountApiSession(accessToken);
    }
    export async function endCurrentAccountApiSession(supabase) {
      return postAccountApiJson("sessions/end", accessToken, { reason: "signed-out" }, { idempotencyKey });
    }
  `,
  accountDal: `
    export async function requireCurrentAccount() {
      await requireSatisfiedAssurance();
      await heartbeatProtectedAccountApiSession();
    }
    export async function requireCurrentProfile() {
      await requireSatisfiedAssurance();
      await heartbeatProtectedAccountApiSession();
    }
    export async function requireCurrentSessions() {
      await requireSatisfiedAssurance();
      await heartbeatProtectedAccountApiSession();
    }
    export async function requireCurrentActivityEvents() {
      await requireSatisfiedAssurance();
      await heartbeatProtectedAccountApiSession();
    }
    async function heartbeatProtectedAccountApiSession() {
      await heartbeatCurrentAccountApiSession(client);
    }
  `,
  adminAccess: `
    async function currentAccountApiIdentity() {
      const me = await fetchAccountApiMe(accessToken);
      await heartbeatAccountApiSession(accessToken);
      return { accessToken, me };
    }
    export async function getAdminRoleReportAccess() {
      return await fetchAccountApiRoleReport(accessToken);
    }
  `,
  actionOrigin: `
    export class SameOriginActionError extends Error {}
    export async function requireSameOriginServerAction() {
      const headersList = await headers();
      const origin = headersList.get("origin");
      const referer = headersList.get("referer");
      process.env.NEXT_PUBLIC_SITE_URL;
      if (process.env.NODE_ENV !== "production") return;
      if (!origin && !referer) throw new SameOriginActionError();
    }
  `,
  serverActions: Object.fromEntries(
    SAME_ORIGIN_SERVER_ACTION_PATHS.map((path) => [
      path,
      `export async function action() {
        await requireSameOriginServerAction();
        await mutate();
      }`,
    ]),
  ),
};

const completeSnapshot: RepositorySnapshot = {
  portalPackageJson: JSON.stringify({ dependencies: { next: "16.3.4" } }),
  portalEnvironmentExample: [
    "NEXT_PUBLIC_SITE_URL=https://account.example.invalid",
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
    securityReauthenticatesBeforeMutation: true,
    loginRequiresSatisfiedAssurance: true,
    accountGuardEnforcesAssurance: true,
    securityActionsRequireAssurance: true,
    accountActionsRequireAssurance: true,
    enrollmentBindsProviderIssuedFactor: true,
    sessionQueriesUseSafeReadColumns: true,
    portalSessionLifecycleHooks: true,
    serverActionsRequireSameOrigin: true,
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
      "/connect/:path*",
    ],
  },
  desktopEnvironmentExample: "QT_ACCOUNT_API_URL QT_ACCOUNT_PORTAL_URL QT_AUTH_API_ENDPOINT",
  azureSqlSchema: AZURE_SQL_SCHEMA,
  desktopAuthService: `
    self._account_session_revoked_user_ids: set[int] = set()
    def _hash_cloud_local_password_lock(self) -> str:
      return self.hash_password(secrets.token_urlsafe(48))
    def create_session(self, user):
      self._account_session_revoked_user_ids.discard(int(db_user.id))
    def _mark_account_session_revoked(self, user_id: int) -> None:
      self._account_session_revoked_user_ids.add(int(user_id))
      self.clear_session_file()
      self.clear_cloud_session_files()
    def _send_account_session_event(self, user_id, route, payload, *, access_token=None):
      if self._account_session_denied_text(str(exc)):
        self._mark_account_session_revoked(int(user_id))
    def validate_session(self, session_token, *, touch=True):
      if int(user.id) in self._account_session_revoked_user_ids:
        record.is_active = False
        record.ended_at = now
        return None, None
    def _upsert_local_cloud_user(self, *, cloud_user_id, email, metadata, profile, is_admin, action, details):
      password_hash = self._hash_cloud_local_password_lock()
      user.password_hash = password_hash
    def change_password(self, user_id, current_password, new_password):
      return False, 'Change your password from the account console (Account → Security).'
    def _push_cloud_profile_changes(self, access_token, cloud_user_id, changes):
      return self._account_api_update_profile(access_token, changes)
    def _account_api_update_profile(self, access_token, changes):
      body = {key: value for key, value in changes.items() if key in ACCOUNT_PROFILE_UPDATE_FIELDS}
      body['expected_profile_version'] = max(version, 1)
      self._account_api_request('auth/user/profile/update', access_token, payload=body, idempotency_key=key)
  `,
  desktopSupabaseService: null,
  desktopAzureFunction: [
    "Access-Control-Allow-Origin: https://console.quantifyterminal.com",
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
      "management_send_email",
    ].map((route) => `@app.route(route=\"${route}\")`),
  ].join("\n"),
  desktopAzureDocumentation:
    "rg-quantify-terminal-prod func-quantify-updates-prod qtterminalprod001",
  desktopAzureRequirements: "azure-functions==1.20.0\nazure-storage-blob==12.22.0\n",
  marketingVercelConfig: "{}",
  marketingStylesheet: ":root { --bg: #000; --accent: orange; --text: white; }",
  accountInfrastructureDefinition: "resource accountFunction 'Microsoft.Web/sites@2024-04-01' = {}",
  accountApiEvidence: {
    modularPackage: true,
    versionedRoutePrefix: true,
    unauthenticatedHealthRoute: true,
    exactOriginCors: true,
    bearerAndActiveChecks: true,
    canonicalRoleMatrix: true,
    correlatedAudit: true,
    typedErrors: true,
    idempotentMutations: true,
    sessionLifecycleRoutes: true,
    adminMetricsRoute: true,
    adminAuditExplorerRoute: true,
    reportRoutes: true,
    accountLifecycleRoutes: true,
    privateArtifactDownloads: true,
    reportGenerationWorker: true,
    accountExportGenerationWorker: true,
    accountDeletionCleanupWorker: true,
    adminUsersRoute: true,
    adminUserActivationRoute: true,
    adminUserSessionRevokeRoute: true,
    notificationRoutes: true,
    ownerStatusRoutes: true,
    allowListedResponses: true,
    dualReadRolesWithoutCutover: true,
    pinnedRequirements: true,
    safeStagingInfrastructure: true,
  },
};

const validEnvironment = {
  NEXT_PUBLIC_SITE_URL: "https://console.quantifyterminal.com",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-public-value",
  QT_ACCOUNT_API_URL: "https://account-api.azurewebsites.net/api/v1",
};

describe("preflight audit", () => {
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
    expect(report.checks.find(({ id }) => id === "azure.sql-schema")?.status).toBe("pass");
    expect(report.checks.find(({ id }) => id === "desktop.no-supabase")?.status).toBe("pass");
    expect(report.checks.find(({ id }) => id === "azure.current-routes")?.status).toBe("pass");
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
      ...TASK7_LIFECYCLE_SOURCES,
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
      ...TASK7_LIFECYCLE_SOURCES,
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

  it.each([
    [
      "a password change that updates before reauthenticating",
      {
        securityActions: TASK7_SECURITY_ACTIONS.replace(
          `    const verification = await verifyCurrentPassword(caller.email, parsed.data.currentPassword);
    await authClient.updatePassword(accessToken, parsed.data.password);`,
          `    await authClient.updatePassword(accessToken, parsed.data.password);
    const verification = await verifyCurrentPassword(caller.email, parsed.data.currentPassword);`,
        ),
      },
      "securityReauthenticatesBeforeMutation",
    ],
    [
      "a factor removal with no reauthentication at all",
      {
        securityActions: TASK7_SECURITY_ACTIONS.replace(
          "    const verification = await verifyCurrentPassword(caller.email, submitted.data.currentPassword);\n",
          "",
        ),
      },
      "securityReauthenticatesBeforeMutation",
    ],
    [
      "an enrollment that mints a factor without reauthentication",
      {
        securityActions: TASK7_SECURITY_ACTIONS.replace(
          `    return TOTP_SERVICE_ERROR; // Azure TOTP enrollment is source-locked.`,
          `    await authClient.enroll({ factorType: "totp" });`,
        ),
      },
      "securityReauthenticatesBeforeMutation",
    ],
    [
      "a password change with no assurance gate",
      {
        securityActions: TASK7_SECURITY_ACTIONS.replace(
          `    const { decision } = await requireMutationAssurance();
    if (decision !== "satisfied") return PASSWORD_SERVICE_ERROR;\n`,
          "",
        ),
      },
      "securityActionsRequireAssurance",
    ],
    [
      "a factor removal that gates only after unenrolling",
      {
        securityActions: TASK7_SECURITY_ACTIONS.replace(
          `    const { decision, assurance } = await requireMutationAssurance();
    if (decision !== "satisfied") return TOTP_SERVICE_ERROR;
    const azure = await createServerAzureClient();
    const verification = await verifyCurrentPassword(caller.email, submitted.data.currentPassword);
    return TOTP_SERVICE_ERROR; // Azure TOTP removal is source-locked.`,
          `    const verification = await verifyCurrentPassword(caller.email, submitted.data.currentPassword);
    await authClient.unenroll({ factorId: submitted.data.factorId });
    const { decision, assurance } = await requireMutationAssurance();
    if (decision !== "satisfied") return TOTP_SERVICE_ERROR;`,
        ),
      },
      "securityActionsRequireAssurance",
    ],
    [
      "a security action whose refusal sits after the mutation",
      {
        securityActions: TASK7_SECURITY_ACTIONS.replace(
          `    const { decision } = await requireMutationAssurance();
    if (decision !== "satisfied") return PASSWORD_SERVICE_ERROR;
    const azure = await createServerAzureClient();
    const verification = await verifyCurrentPassword(caller.email, parsed.data.currentPassword);
    await authClient.updatePassword(accessToken, parsed.data.password);`,
          `    const { decision } = await requireMutationAssurance();
    const azure = await createServerAzureClient();
    const verification = await verifyCurrentPassword(caller.email, parsed.data.currentPassword);
    await authClient.updatePassword(accessToken, parsed.data.password);
    if (decision !== "satisfied") return PASSWORD_SERVICE_ERROR;`,
        ),
      },
      "securityActionsRequireAssurance",
    ],
    [
      "a security action that refuses an owed factor but proceeds on an unreadable one",
      {
        securityActions: TASK7_SECURITY_ACTIONS.replace(
          '    if (decision !== "satisfied") return EMAIL_SERVICE_ERROR;',
          '    if (decision === "challenge-required") return EMAIL_CHALLENGE_ERROR;',
        ),
      },
      "securityActionsRequireAssurance",
    ],
    [
      "a profile mutation whose refusal sits after the write",
      {
        profileAction: TASK7_PROFILE_ACTION.replace(
          `    if (decision !== "satisfied") return SERVICE_ERROR;
    const azure = await createServerAzureClient();
    const user = await azure.getUser();
    const result = await updateAccountApiProfile(accessToken, {}, { idempotencyKey });`,
          `    const azure = await createServerAzureClient();
    const user = await azure.getUser();
    const result = await updateAccountApiProfile(accessToken, {}, { idempotencyKey });
    if (decision !== "satisfied") return SERVICE_ERROR;`,
        ),
      },
      "accountActionsRequireAssurance",
    ],
    [
      "a security action that asks for the decision and discards it",
      {
        securityActions: TASK7_SECURITY_ACTIONS.replace(
          '    if (decision !== "satisfied") return EMAIL_SERVICE_ERROR;\n',
          "",
        ),
      },
      "securityActionsRequireAssurance",
    ],
    [
      "a profile mutation that asks for the decision and discards it",
      {
        profileAction: TASK7_PROFILE_ACTION.replace(
          '    if (decision !== "satisfied") return SERVICE_ERROR;\n',
          "",
        ),
      },
      "accountActionsRequireAssurance",
    ],
    [
      "a profile mutation with no assurance gate",
      {
        profileAction: `
          export async function updateProfile() {
            const azure = await createServerAzureClient();
            const user = await azure.getUser();
            const result = await updateAccountApiProfile(accessToken, {}, { idempotencyKey });
          }
        `,
      },
      "accountActionsRequireAssurance",
    ],
    [
      "a preferences mutation that gates after the write",
      {
        preferencesAction: `
          export async function updatePreferences() {
            const azure = await createServerAzureClient();
            const user = await azure.getUser();
            const result = await updateAccountApiProfile(accessToken, {}, { idempotencyKey });
            const { decision } = await requireMutationAssurance();
            if (decision !== "satisfied") return SERVICE_ERROR;
          }
        `,
      },
      "accountActionsRequireAssurance",
    ],
    [
      "an enrollment confirmation that trusts the submitted factor id",
      {
        securityActions: TASK7_SECURITY_ACTIONS.replace(
          "    if (!assurance.unverifiedTotpFactorIds.includes(submitted.data.factorId)) return;\n",
          "",
        ),
      },
      "enrollmentBindsProviderIssuedFactor",
    ],
    [
      "a guard whose mutation counterpart never asks for a decision",
      {
        accountGuard: `
          export async function requireSatisfiedAssurance() {
            const assurance = await getCurrentAssurance();
            if (assurance.challengeRequired) redirect(MFA_CHALLENGE_NOTICE);
            return assurance;
          }
          export async function requireMutationAssurance() {
            const assurance = await getCurrentAssurance();
            return { decision: "satisfied", assurance };
          }
        `,
      },
      "accountGuardEnforcesAssurance",
    ],
    [
      "a login that redirects before recording lifecycle",
      {
        loginActions: `
          export async function login() {
            const azure = await createServerAzureClient();
            const { data, error } = await azure.signInWithPassword(email, password);
            redirect(parsed.data.nextPath);
            await registerCurrentAccountApiSession(azure);
          }
        `,
      },
      "loginRequiresSatisfiedAssurance",
    ],
    [
      "a login that never records Account API lifecycle",
      {
        loginActions: `
          export async function login() {
            const azure = await createServerAzureClient();
            const { data, error } = await azure.signInWithPassword(email, password);
            redirect(parsed.data.nextPath);
          }
        `,
      },
      "loginRequiresSatisfiedAssurance",
    ],
    [
      "a guard that resolves assurance but never refuses",
      {
        accountGuard: `
          export async function requireSatisfiedAssurance() {
            const assurance = await getCurrentAssurance();
            return assurance;
          }
          export async function requireMutationAssurance() {
            const assurance = await getCurrentAssurance();
            return { decision: assuranceForMutation(assurance), assurance };
          }
        `,
      },
      "accountGuardEnforcesAssurance",
    ],
    [
      "session reads that include sensitive provider fields",
      {
        sessionQuery: TASK7_LIFECYCLE_SOURCES.sessionQuery.replace(
          "return mapAccountSessions(userId, rows, options);",
          'const provider_session_id = "leak"; return mapAccountSessions(userId, rows, options);',
        ),
      },
      "sessionQueriesUseSafeReadColumns",
    ],
    [
      "portal lifecycle hooks that omit protected route heartbeat",
      {
        accountDal: TASK7_LIFECYCLE_SOURCES.accountDal.replaceAll(
          "await heartbeatProtectedAccountApiSession();",
          "",
        ),
      },
      "portalSessionLifecycleHooks",
    ],
    [
      "a Server Action that omits same-origin provenance",
      {
        serverActions: {
          ...TASK7_LIFECYCLE_SOURCES.serverActions,
          "src/app/login/actions.ts": `
            export async function login() {
              await mutate();
            }
          `,
        },
      },
      "serverActionsRequireSameOrigin",
    ],
  ])("rejects %s", (_label, overrides, relationship) => {
    const evidence = analyzePortalAuthLifecycle({
      ...TASK7_LIFECYCLE_SOURCES,
      ...(overrides as Partial<typeof TASK7_LIFECYCLE_SOURCES>),
    });

    expect(evidence?.[relationship as keyof typeof evidence]).toBe(false);
  });

  it("accepts the complete Task 7 relationship set", () => {
    const evidence = analyzePortalAuthLifecycle(TASK7_LIFECYCLE_SOURCES);

    expect(evidence).not.toBeNull();
    // Every relationship, so a new one cannot be added without a fixture that proves it.
    expect(Object.values(evidence ?? {}).every(Boolean)).toBe(true);
    expect(evidence?.securityReauthenticatesBeforeMutation).toBe(true);
    expect(evidence?.loginRequiresSatisfiedAssurance).toBe(true);
    expect(evidence?.accountGuardEnforcesAssurance).toBe(true);
    expect(evidence?.securityActionsRequireAssurance).toBe(true);
    expect(evidence?.accountActionsRequireAssurance).toBe(true);
    expect(evidence?.enrollmentBindsProviderIssuedFactor).toBe(true);
    expect(evidence?.sessionQueriesUseSafeReadColumns).toBe(true);
    expect(evidence?.portalSessionLifecycleHooks).toBe(true);
    expect(evidence?.serverActionsRequireSameOrigin).toBe(true);
  });

  it.each([
    "securityActions",
    "loginActions",
    "accountGuard",
    "profileAction",
    "preferencesAction",
    "sessionQuery",
    "sessionLifecycle",
    "accountDal",
    "adminAccess",
  ])("reports unavailable lifecycle evidence when %s cannot be read", (missing) => {
    const evidence = analyzePortalAuthLifecycle({
      ...TASK7_LIFECYCLE_SOURCES,
      [missing]: null,
    });

    expect(evidence).toBeNull();
  });

  it.each(["startTotpEnrollment", "confirmTotpEnrollment"])(
    "reports unavailable lifecycle evidence when %s is absent from the security actions",
    (removed) => {
      const evidence = analyzePortalAuthLifecycle({
        ...TASK7_LIFECYCLE_SOURCES,
        securityActions: TASK7_SECURITY_ACTIONS.replace(
          `export async function ${removed}()`,
          `export async function ${removed}Renamed()`,
        ),
      });

      expect(evidence).toBeNull();
    },
  );

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
              "script-src 'self' https://challenges.cloudflare.com; connect-src 'self' https://*.azurewebsites.net",
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

  it("blocks missing local contracts", () => {
    const checks = auditRepositories({
      ...completeSnapshot,
      portalPackageJson: null,
      azureSqlSchema: "CREATE TABLE dbo.app_profiles ([user_id] uniqueidentifier NOT NULL);",
      accountInfrastructureDefinition: null,
    });

    expect(checks.some(({ status }) => status === "blocked")).toBe(true);
    expect(checks.find(({ id }) => id === "azure.sql-schema")?.status).toBe("blocked");
  });

  it("blocks the desktop contract when Supabase code or configuration is still present", () => {
    const withModule = auditRepositories({
      ...completeSnapshot,
      desktopSupabaseService: "class SupabaseService:\n    pass",
    });
    expect(withModule.find(({ id }) => id === "desktop.no-supabase")?.status).toBe("blocked");

    const withEnvironment = auditRepositories({
      ...completeSnapshot,
      desktopEnvironmentExample: `${completeSnapshot.desktopEnvironmentExample} SUPABASE_URL`,
    });
    expect(withEnvironment.find(({ id }) => id === "desktop.no-supabase")?.status).toBe("blocked");
    expect(withEnvironment.find(({ id }) => id === "desktop.public-cloud-contract")?.status).toBe(
      "blocked",
    );

    const withClient = auditRepositories({
      ...completeSnapshot,
      desktopAuthService: `${completeSnapshot.desktopAuthService}\n    self.supabase_service.fetch_app_state()`,
    });
    expect(withClient.find(({ id }) => id === "desktop.no-supabase")?.status).toBe("blocked");
  });

  it("requires the Azure SQL schema snapshot to carry every account table and the role contract", () => {
    expect(
      auditRepositories(completeSnapshot).find(({ id }) => id === "azure.sql-schema")?.status,
    ).toBe("pass");

    const missingTable = auditRepositories({
      ...completeSnapshot,
      azureSqlSchema: AZURE_SQL_SCHEMA.replace(
        "CREATE TABLE dbo.app_states",
        "CREATE TABLE dbo.app_states_old",
      ),
    }).find(({ id }) => id === "azure.sql-schema");
    expect(missingTable?.status).toBe("blocked");
    expect(missingTable?.evidence).toContain("Missing table: app_states");

    const noOwner = auditRepositories({
      ...completeSnapshot,
      azureSqlSchema: AZURE_SQL_SCHEMA.replace("[role]='owner'", "[role]='root'"),
    });
    expect(noOwner.find(({ id }) => id === "azure.sql-schema")?.status).toBe("blocked");
    expect(
      auditRepositories({ ...completeSnapshot, azureSqlSchema: null }).find(
        ({ id }) => id === "azure.sql-schema",
      )?.status,
    ).toBe("blocked");
  });

  it("requires desktop profile writes to use the Account API's versioned update", () => {
    expect(
      auditRepositories(completeSnapshot).find(
        ({ id }) => id === "desktop.versioned-profile-writer",
      )?.status,
    ).toBe("pass");

    const broken = auditRepositories({
      ...completeSnapshot,
      desktopAuthService: completeSnapshot.desktopAuthService!.replace(
        "'auth/user/profile/update'",
        "'auth/user/profile'",
      ),
    });
    expect(broken.find(({ id }) => id === "desktop.versioned-profile-writer")?.status).toBe(
      "blocked",
    );
  });

  it("blocks the account API contract when its package evidence is unavailable", () => {
    const checks = auditRepositories({ ...completeSnapshot, accountApiEvidence: null });
    const contract = checks.find(({ id }) => id === "azure.account-api-contract");

    expect(contract?.status).toBe("blocked");
    expect(contract?.evidence).toContain("Account API package evidence is unavailable.");
  });

  it.each([
    "modularPackage",
    "versionedRoutePrefix",
    "unauthenticatedHealthRoute",
    "exactOriginCors",
    "bearerAndActiveChecks",
    "canonicalRoleMatrix",
    "correlatedAudit",
    "typedErrors",
    "idempotentMutations",
    "sessionLifecycleRoutes",
    "adminMetricsRoute",
    "adminAuditExplorerRoute",
    "reportRoutes",
    "accountLifecycleRoutes",
    "privateArtifactDownloads",
    "reportGenerationWorker",
    "accountExportGenerationWorker",
    "accountDeletionCleanupWorker",
    "adminUsersRoute",
    "adminUserActivationRoute",
    "adminUserSessionRevokeRoute",
    "notificationRoutes",
    "allowListedResponses",
    "dualReadRolesWithoutCutover",
    "pinnedRequirements",
    "safeStagingInfrastructure",
  ])("blocks the account API contract when %s is absent", (property) => {
    const checks = auditRepositories({
      ...completeSnapshot,
      accountApiEvidence: {
        ...completeSnapshot.accountApiEvidence!,
        [property]: false,
      },
    });
    const contract = checks.find(({ id }) => id === "azure.account-api-contract");

    expect(contract?.status).toBe("blocked");
    expect(contract?.evidence).toContain(`Missing property: ${property}`);
  });

  it("labels the account API and infrastructure checks as source-only evidence", () => {
    const checks = auditRepositories(completeSnapshot);

    // Both checks read files. Neither is evidence that Azure, ARM, or a provider agrees.
    expect(checks.find(({ id }) => id === "azure.account-api-contract")?.evidence).toContain(
      "Structural source checks only; no live provider, Azure, or ARM behavior is evidenced.",
    );
    expect(checks.find(({ id }) => id === "azure.account-infrastructure")?.evidence).toContain(
      "Reviewed source only; the template has not been linted by ARM or deployed.",
    );
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

  it("requires desktop cloud auth to avoid reusable local password verifiers", () => {
    const checks = auditRepositories(completeSnapshot);
    expect(checks.find(({ id }) => id === "desktop.cloud-password-lock")?.status).toBe("pass");

    const broken = auditRepositories({
      ...completeSnapshot,
      desktopAuthService: completeSnapshot.desktopAuthService!.replace(
        "password_hash = self._hash_cloud_local_password_lock()",
        "password_hash = self.hash_password(password)",
      ),
    });

    expect(broken.find(({ id }) => id === "desktop.cloud-password-lock")?.status).toBe("blocked");
  });

  it("requires desktop runtime validation after revoked-session API responses", () => {
    const checks = auditRepositories(completeSnapshot);
    expect(checks.find(({ id }) => id === "desktop.revoked-session-runtime-guard")?.status).toBe(
      "pass",
    );

    const broken = auditRepositories({
      ...completeSnapshot,
      desktopAuthService: completeSnapshot.desktopAuthService!.replace(
        "record.is_active = False",
        "record.is_active = True",
      ),
    });

    expect(broken.find(({ id }) => id === "desktop.revoked-session-runtime-guard")?.status).toBe(
      "blocked",
    );
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
