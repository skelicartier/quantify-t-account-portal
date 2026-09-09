import {
  auditRepositories,
  buildPreflightReport,
  extractAzureRoutes,
  preflightExitCode,
} from "@/lib/preflight/audit";
import {
  DESKTOP_SUPABASE_MIGRATION_ARTIFACTS,
  DESKTOP_SUPABASE_MIGRATION_FILENAMES,
  type MigrationArtifact,
  type RepositorySnapshot,
} from "@/lib/preflight/model";
import { renderPreflightMarkdown } from "@/lib/preflight/report";
import {
  analyzePortalAuthLifecycle,
  analyzePortalSecurityHeaders,
  SAME_ORIGIN_SERVER_ACTION_PATHS,
} from "@/lib/preflight/source-analysis";

const PROFILE_CONTRACT_SCHEMA = String.raw`
  alter table public.app_profiles
    add column profile_version bigint not null default 1;
  alter table public.app_profiles
    add constraint app_profiles_profile_version_check
    check (profile_version > 0);

  create function public.increment_app_profile_version()
  returns trigger
  language plpgsql
  set search_path = ''
  as $$
  begin
    new.profile_version := old.profile_version + 1;
    return new;
  end;
  $$;

  create trigger trg_app_profiles_increment_version
  before update on public.app_profiles
  for each row execute function public.increment_app_profile_version();

  create or replace function public.update_my_app_profile(
    p_first_name text default null,
    p_last_name text default null,
    p_phone text default null,
    p_country text default null,
    p_timezone text default null,
    p_default_currency text default null,
    p_profile_photo_path text default null,
    p_notify_price_alerts boolean default null,
    p_notify_portfolio_moves boolean default null,
    p_notify_news_digest boolean default null,
    p_data_refresh_rate text default null,
    p_theme_preference text default null,
    p_two_factor_enabled boolean default null
  )
  returns public.app_profiles
  language plpgsql
  security definer
  set search_path = ''
  as $$ begin return null; end; $$;

  create function public.update_my_app_profile_v2(
    p_expected_profile_version bigint,
    p_first_name text default null,
    p_last_name text default null,
    p_phone text default null,
    p_country text default null,
    p_timezone text default null,
    p_default_currency text default null,
    p_notify_price_alerts boolean default null,
    p_notify_portfolio_moves boolean default null,
    p_notify_news_digest boolean default null,
    p_data_refresh_rate text default null,
    p_theme_preference text default null,
    p_two_factor_enabled boolean default null
  )
  returns table (
    user_id uuid,
    profile_version bigint,
    updated_at timestamp with time zone
  )
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    caller_user_id uuid;
    affected_rows integer;
  begin
    caller_user_id := auth.uid();
    if caller_user_id is null then
      raise exception 'Authentication required' using errcode = '42501';
    end if;
    if not public.app_is_active() then
      raise exception 'Active account required' using errcode = '42501';
    end if;
    if p_expected_profile_version is null or p_expected_profile_version <= 0 then
      raise exception 'Expected profile version must be positive' using errcode = '22023';
    end if;

    return query
    update public.app_profiles as profile
    set
      first_name = case
        when p_first_name is null then profile.first_name
        else pg_catalog.btrim(p_first_name)
      end,
      last_name = case
        when p_last_name is null then profile.last_name
        else pg_catalog.btrim(p_last_name)
      end,
      phone = case
        when p_phone is null then profile.phone
        else pg_catalog.btrim(p_phone)
      end,
      country = case
        when p_country is null then profile.country
        else pg_catalog.btrim(p_country)
      end,
      timezone = case
        when p_timezone is null then profile.timezone
        else pg_catalog.btrim(p_timezone)
      end,
      default_currency = case
        when p_default_currency is null then profile.default_currency
        else pg_catalog.upper(pg_catalog.btrim(p_default_currency))
      end,
      notify_price_alerts = coalesce(
        p_notify_price_alerts, profile.notify_price_alerts
      ),
      notify_portfolio_moves = coalesce(
        p_notify_portfolio_moves, profile.notify_portfolio_moves
      ),
      notify_news_digest = coalesce(
        p_notify_news_digest, profile.notify_news_digest
      ),
      data_refresh_rate = case
        when p_data_refresh_rate is null then profile.data_refresh_rate
        else pg_catalog.btrim(p_data_refresh_rate)
      end,
      theme_preference = case
        when p_theme_preference is null then profile.theme_preference
        else pg_catalog.lower(pg_catalog.btrim(p_theme_preference))
      end,
      two_factor_enabled = coalesce(
        p_two_factor_enabled, profile.two_factor_enabled
      ),
      updated_at = pg_catalog.now()
    where profile.user_id = caller_user_id
      and profile.is_active is true
      and profile.profile_version = p_expected_profile_version
    returning
      profile.user_id,
      profile.profile_version,
      profile.updated_at;

    get diagnostics affected_rows = row_count;
    if affected_rows = 0 then
      if not exists (
        select 1
        from public.app_profiles profiles
        where profiles.user_id = caller_user_id
          and profiles.is_active is true
      ) then
        raise exception 'Active account required' using errcode = '42501';
      end if;
      raise exception 'Profile version is stale' using errcode = '40001';
    end if;
    return;
  end;
  $$;

  revoke all on function public.update_my_app_profile_v2(
    bigint, text, text, text, text, text, text,
    boolean, boolean, boolean, text, text, boolean
  ) from public, anon, authenticated, service_role;
  grant execute on function public.update_my_app_profile_v2(
    bigint, text, text, text, text, text, text,
    boolean, boolean, boolean, text, text, boolean
  ) to authenticated;
`;

const PROFILE_V2_TYPE_SIGNATURE_SQL = `
  bigint, text, text, text, text, text, text,
  boolean, boolean, boolean, text, text, boolean
`;

const TASK7_CONFIRM_ROUTE = `
  async function GET(request) {
    const tokens = new URL(request.url).searchParams.getAll("token");
    const token = tokens.length === 1 ? tokens[0]?.trim() : "";
    if (!token || token.length > 4_096) return Response.redirect("/login?notice=invalid-confirm-link");
    try {
      const config = getAzureAuthConfig();
      await new AzureAuthClient(config.apiUrl).confirmEmail(token);
      return Response.redirect("/login?notice=email-confirmed");
    } catch {}
    return Response.redirect("/login?notice=invalid-confirm-link");
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
    const result = await azureUpdate("app_profiles", {}, []);
  }
`;

const TASK7_PREFERENCES_ACTION = `
  export async function updatePreferences() {
    const { decision } = await requireMutationAssurance();
    if (decision !== "satisfied") return SERVICE_ERROR;
    const azure = await createServerAzureClient();
    const user = await azure.getUser();
    const result = await azureUpdate("app_profiles", {}, []);
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
    export const ACCOUNT_SESSION_COLUMNS = [
      "id",
      "user_id",
      "source",
      "provider",
      "client_instance_id",
      "device_name",
      "created_at",
      "last_seen_at",
      "expires_at",
      "revoked_at",
      "revoke_reason",
    ].join(",");
    export const ACCOUNT_ACTIVITY_COLUMNS = [
      "id",
      "user_id",
      "session_id",
      "event_type",
      "outcome",
      "source",
      "occurred_at",
      "created_at",
    ].join(",");
    export async function loadAccountSessions(client) {
      const userId = await currentVerifiedUserId(client);
      const result = await azureFrom("account_sessions")
        .select(ACCOUNT_SESSION_COLUMNS)
        .eq("user_id", userId)
        .order("last_seen_at", { ascending: false })
        .limit(ACCOUNT_SESSION_LIMIT)
        .execute();
      return mapAccountSessions(userId, result.data);
    }
    export async function loadAccountActivityEvents(client) {
      const userId = await currentVerifiedUserId(client);
      const result = await azureFrom("auth_events")
        .select(ACCOUNT_ACTIVITY_COLUMNS)
        .eq("user_id", userId)
        .order("occurred_at", { ascending: false })
        .limit(ACCOUNT_ACTIVITY_LIMIT)
        .execute();
      return mapAccountActivityEvents(userId, result.data);
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

function exactMigrationArtifacts(): MigrationArtifact[] {
  return DESKTOP_SUPABASE_MIGRATION_ARTIFACTS.map((artifact) => ({ ...artifact }));
}

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
    ${PROFILE_CONTRACT_SCHEMA}
  `,
  desktopSupabaseMigrations: exactMigrationArtifacts(),
  desktopAuthService: `
    self._account_session_revoked_user_ids: set[int] = set()
    def _hash_cloud_local_password_lock(self) -> str:
      return self.hash_password(secrets.token_urlsafe(48))
    def create_session(self, user):
      self._account_session_revoked_user_ids.discard(int(db_user.id))
    def _mark_account_session_revoked(self, user_id: int) -> None:
      self._account_session_revoked_user_ids.add(int(user_id))
      self.clear_session_file()
      self.clear_supabase_session_file()
    def _send_account_session_event(self, user_id, route, payload, *, access_token=None):
      if self._account_session_denied_text(str(exc)):
        self._mark_account_session_revoked(int(user_id))
    def validate_session(self, session_token, *, touch=True):
      if int(user.id) in self._account_session_revoked_user_ids:
        record.is_active = False
        record.ended_at = now
        return None, None
    def _upsert_local_user_from_supabase(self, cloud_session, profile, *, password=None):
      password_hash = self._hash_cloud_local_password_lock()
      user.password_hash = password_hash
    def change_password(self, user_id, current_password, new_password):
      self.supabase_service.update_current_user_password(cloud_session.access_token, new_password)
      if self.is_online_auth_enabled() or str(getattr(user, 'cloud_user_id', '') or '').strip():
        user.password_hash = self._hash_cloud_local_password_lock()
      else:
        user.password_hash = self.hash_password(new_password)
    def reset_password(self, email, otp_code, new_password):
      if str(getattr(user, 'cloud_user_id', '') or '').strip():
        user.password_hash = self._hash_cloud_local_password_lock()
      else:
        user.password_hash = self.hash_password(new_password)
  `,
  desktopSupabaseService: `
    def upsert_app_profile(self, access_token, user_id, payload):
      current_profile = self.fetch_app_profile(token, cloud_user_id)
      allowed["p_expected_profile_version"] = expected_version
      response = self._request_json("POST", "/rest/v1/rpc/update_my_app_profile_v2", allowed)
      self._validate_versioned_profile_receipt(response, cloud_user_id, expected_version)
    def _validate_versioned_profile_receipt(self, response, user_id, expected_version):
      if row is None or set(row) != {"user_id", "profile_version", "updated_at"}:
        raise SupabaseServiceError("receipt")
      if version != expected_version + 1:
        raise SupabaseServiceError("version")
  `,
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
      "20260902000700_profile_contract_preflight.sql",
      "20260902000900_versioned_profile_rpc.sql",
      "20260902001000_profile_contract_validation.sql",
    ]);
    expect(DESKTOP_SUPABASE_MIGRATION_FILENAMES).toHaveLength(11);
    expect(DESKTOP_SUPABASE_MIGRATION_FILENAMES).not.toContain(
      "20260902000800_profile_photo_storage.sql",
    );
    expect(DESKTOP_SUPABASE_MIGRATION_FILENAMES.every((name) => !/photo/u.test(name))).toBe(true);
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

    const profileCheck = report.checks.find(({ id }) => id === "supabase.profile-contract");
    expect(profileCheck).toMatchObject({ status: "pass", evidence: [] });
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

  it("fails closed when the additive profile version column is absent", () => {
    const schema = completeSnapshot.desktopSupabaseSchema!.replace(
      /\s*alter table public\.app_profiles\s+add column profile_version bigint not null default 1;/u,
      "",
    );
    const profileCheck = auditRepositories({
      ...completeSnapshot,
      desktopSupabaseSchema: schema,
    }).find(({ id }) => id === "supabase.profile-contract");

    expect(profileCheck?.status).toBe("blocked");
    expect(profileCheck?.evidence).toContain(
      "Missing additive profile_version bigint NOT NULL DEFAULT 1 column.",
    );
  });

  it("asserts nothing about buckets, Storage policies, or photo columns", () => {
    const profileCheck = auditRepositories(completeSnapshot).find(
      ({ id }) => id === "supabase.profile-contract",
    );

    expect(profileCheck?.status).toBe("pass");
    expect(profileCheck?.summary).not.toMatch(/photo|bucket|storage/iu);
    expect(completeSnapshot.desktopSupabaseSchema).not.toMatch(/storage\.(?:buckets|objects)/u);
    expect(JSON.stringify(profileCheck)).not.toMatch(/bucket|storage|webp/iu);
  });

  it("stays passing when unrelated Storage source exists, because the portal makes no Storage claim", () => {
    const profileCheck = auditRepositories({
      ...completeSnapshot,
      desktopSupabaseSchema: `${completeSnapshot.desktopSupabaseSchema}
        insert into storage.buckets (id, name, public) values ('unrelated', 'unrelated', false);
        create policy unrelated_storage_all on storage.objects
        for all to authenticated using (auth.uid() is not null);`,
    }).find(({ id }) => id === "supabase.profile-contract");

    expect(profileCheck?.status).toBe("pass");
    expect(profileCheck?.evidence).toEqual([]);
  });

  it("fails closed when the retired photo arguments reappear in the v2 signature", () => {
    const schema = completeSnapshot.desktopSupabaseSchema!.replace(
      "p_default_currency text default null,\n    p_notify_price_alerts boolean default null,",
      "p_default_currency text default null,\n    p_profile_photo_path text default null,\n    p_clear_profile_photo boolean default false,\n    p_notify_price_alerts boolean default null,",
    );
    const profileCheck = auditRepositories({
      ...completeSnapshot,
      desktopSupabaseSchema: schema,
    }).find(({ id }) => id === "supabase.profile-contract");

    expect(profileCheck?.status).toBe("blocked");
    expect(profileCheck?.evidence).toContain(
      "Missing exact security-definer update_my_app_profile_v2 identity and minimal three-column receipt.",
    );
  });

  it("fails closed when the v2 receipt returns a fourth column", () => {
    const schema = completeSnapshot
      .desktopSupabaseSchema!.replace(
        "updated_at timestamp with time zone\n  )",
        "updated_at timestamp with time zone,\n    profile_photo_path text\n  )",
      )
      .replace("profile.updated_at;", "profile.updated_at,\n      profile.profile_photo_path;");
    const profileCheck = auditRepositories({
      ...completeSnapshot,
      desktopSupabaseSchema: schema,
    }).find(({ id }) => id === "supabase.profile-contract");

    expect(profileCheck?.status).toBe("blocked");
    expect(profileCheck?.evidence).toEqual(
      expect.arrayContaining([
        "Missing exact security-definer update_my_app_profile_v2 identity and minimal three-column receipt.",
        "Missing v2 minimal committed profile mutation receipt.",
      ]),
    );
  });

  it("keeps the retained legacy desktop v1 signature, including its legacy photo argument", () => {
    const schema = completeSnapshot.desktopSupabaseSchema!.replace(
      "    p_profile_photo_path text default null,\n    p_notify_price_alerts boolean default null,\n    p_notify_portfolio_moves boolean default null,\n    p_notify_news_digest boolean default null,\n    p_data_refresh_rate text default null,\n    p_theme_preference text default null,\n    p_two_factor_enabled boolean default null\n  )\n  returns public.app_profiles",
      "    p_notify_price_alerts boolean default null,\n    p_notify_portfolio_moves boolean default null,\n    p_notify_news_digest boolean default null,\n    p_data_refresh_rate text default null,\n    p_theme_preference text default null,\n    p_two_factor_enabled boolean default null\n  )\n  returns public.app_profiles",
    );
    const profileCheck = auditRepositories({
      ...completeSnapshot,
      desktopSupabaseSchema: schema,
    }).find(({ id }) => id === "supabase.profile-contract");

    expect(schema).not.toBe(completeSnapshot.desktopSupabaseSchema);
    expect(profileCheck?.status).toBe("blocked");
    expect(profileCheck?.evidence).toContain(
      "Missing retained 13-argument update_my_app_profile v1 function signal.",
    );
  });

  it("fails closed when the v2 compare-and-swap predicate is malformed", () => {
    const schema = completeSnapshot.desktopSupabaseSchema!.replace(
      "and profile.profile_version = p_expected_profile_version",
      "and profile.profile_version >= p_expected_profile_version",
    );
    const profileCheck = auditRepositories({
      ...completeSnapshot,
      desktopSupabaseSchema: schema,
    }).find(({ id }) => id === "supabase.profile-contract");

    expect(profileCheck?.status).toBe("blocked");
    expect(profileCheck?.evidence).toContain(
      "Missing v2 positive-token CAS and exact SQLSTATE 40001 stale contract.",
    );
  });

  it("fails closed when a v2 profile field mutation is omitted", () => {
    const schema = completeSnapshot.desktopSupabaseSchema!.replace(
      "else pg_catalog.btrim(p_first_name)",
      "else profile.first_name",
    );
    const profileCheck = auditRepositories({
      ...completeSnapshot,
      desktopSupabaseSchema: schema,
    }).find(({ id }) => id === "supabase.profile-contract");

    expect(profileCheck?.status).toBe("blocked");
    expect(profileCheck?.evidence).toContain(
      "Missing exact v2 profile and preference field mutation mappings.",
    );
  });

  it.each([
    [
      "grant widening",
      `grant all on function public.update_my_app_profile_v2(
        ${PROFILE_V2_TYPE_SIGNATURE_SQL}
      ) to anon;`,
    ],
    [
      "later authenticated revoke",
      `revoke execute on function public.update_my_app_profile_v2(
        ${PROFILE_V2_TYPE_SIGNATURE_SQL}
      ) from authenticated;`,
    ],
  ])("fails closed on v2 ACL %s", (_label, aclStatement) => {
    const profileCheck = auditRepositories({
      ...completeSnapshot,
      desktopSupabaseSchema: `${completeSnapshot.desktopSupabaseSchema}\n${aclStatement}`,
    }).find(({ id }) => id === "supabase.profile-contract");

    expect(profileCheck?.status).toBe("blocked");
    expect(profileCheck?.evidence).toContain(
      "Missing exact authenticated-only v2 EXECUTE ACL statement set.",
    );
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
    const result = await azureUpdate("app_profiles", {}, []);`,
          `    const azure = await createServerAzureClient();
    const user = await azure.getUser();
    const result = await azureUpdate("app_profiles", {}, []);
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
            const result = await azureUpdate("app_profiles", {}, []);
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
            const result = await azureUpdate("app_profiles", {}, []);
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
          '"device_name"',
          '"provider_session_id"',
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

  it("requires desktop profile writes to use the versioned RPC", () => {
    const checks = auditRepositories(completeSnapshot);
    expect(checks.find(({ id }) => id === "desktop.versioned-profile-writer")?.status).toBe("pass");

    const broken = auditRepositories({
      ...completeSnapshot,
      desktopSupabaseService: completeSnapshot.desktopSupabaseService!.replace(
        "update_my_app_profile_v2",
        "update_my_app_profile",
      ),
    });

    expect(broken.find(({ id }) => id === "desktop.versioned-profile-writer")?.status).toBe(
      "blocked",
    );
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

describe("pinned desktop migration integrity", () => {
  function reportWith(migrations: RepositorySnapshot["desktopSupabaseMigrations"]) {
    return buildPreflightReport({
      snapshot: { ...completeSnapshot, desktopSupabaseMigrations: migrations },
      environment: validEnvironment,
      generatedAt: "2026-09-02T00:00:00.000Z",
    });
  }

  function integrityCheck(migrations: RepositorySnapshot["desktopSupabaseMigrations"]) {
    const report = reportWith(migrations);
    return {
      report,
      check: report.checks.find(({ id }) => id === "supabase.migration-integrity"),
    };
  }

  /**
   * The eleven pins are the authoritative source-integrity evidence. This test
   * duplicates them literally so a production edit alone can never repin a digest;
   * a reviewed migration change has to update both places deliberately.
   */
  it("pins the exact reviewed digest for every migration in applied order", () => {
    expect(DESKTOP_SUPABASE_MIGRATION_ARTIFACTS).toStrictEqual([
      {
        filename: "20260902000000_local_baseline.sql",
        sha256: "96354d954fa23fce2807ae5602395d4688939d7da66ea2b22f94a290fc5cdfdb",
      },
      {
        filename: "20260902000050_adoption_preflight.sql",
        sha256: "2f2d0f42f4e8f39b59f096aefc1a109523ae6410dbdf9875d2049d5ce71db7ea",
      },
      {
        filename: "20260902000100_immutable_identity.sql",
        sha256: "77d76b4a3bd8f9e71e2f22a2fcb65c91f966d334e48107938e40a20a1a6a8e94",
      },
      {
        filename: "20260902000200_canonical_rbac_provisioning.sql",
        sha256: "9d085a20614a18ea2bf239ef67b9d06ea57f5f72c7cdfa31fa2bff8d0230098e",
      },
      {
        filename: "20260902000300_account_sessions.sql",
        sha256: "170b7cc6c250ffba129f34cc73c62f5e14c5848823e9ef2c061c5f6ada5d46d9",
      },
      {
        filename: "20260902000400_auth_events.sql",
        sha256: "63ebb84627e168f8b0daf1b57766c83a214c4c38e15402ad75c75332865a1b8a",
      },
      {
        filename: "20260902000500_rls_grants_hardening.sql",
        sha256: "b8a80b531910e966e251860a30d97936eda8f306db6d7c2aa7430d317a9aa906",
      },
      {
        filename: "20260902000600_contract_validation.sql",
        sha256: "e3be65feeea020ed44ce809bf577bb931ac2c4b1651e4a53b67184550c34b9cb",
      },
      {
        filename: "20260902000700_profile_contract_preflight.sql",
        sha256: "88f751c1856e55faab43513c7f8e03408c10f9ea9779684de8b5814207e091dd",
      },
      {
        filename: "20260902000900_versioned_profile_rpc.sql",
        sha256: "8afd7fd29aaa3d4a55e77116d9d705be6f836899122a8dd7f2cbde86533997bc",
      },
      {
        filename: "20260902001000_profile_contract_validation.sql",
        sha256: "2a6d2730e6cec843361ade134967d39be626c9fdc34e4a5f9bbe2d1065a52ad7",
      },
    ]);
    expect(DESKTOP_SUPABASE_MIGRATION_ARTIFACTS).toHaveLength(11);
    expect(
      DESKTOP_SUPABASE_MIGRATION_ARTIFACTS.every(({ sha256 }) => /^[0-9a-f]{64}$/u.test(sha256)),
    ).toBe(true);
    // No Storage migration exists any more; Task 6 stores no user images.
    expect(
      DESKTOP_SUPABASE_MIGRATION_FILENAMES.some((filename) => filename.includes("photo")),
    ).toBe(false);
    expect(DESKTOP_SUPABASE_MIGRATION_FILENAMES).toStrictEqual(
      DESKTOP_SUPABASE_MIGRATION_ARTIFACTS.map(({ filename }) => filename),
    );
  });

  it("passes only on the exact ordered manifest", () => {
    const { report, check } = integrityCheck(exactMigrationArtifacts());

    expect(check?.status).toBe("pass");
    expect(check?.summary).toContain("11 desktop migrations");
    expect(report.sourceReady).toBe(true);
    expect(report.stagingReady).toBe(false);
    expect(report.productionReady).toBe(false);
  });

  it("matches the real desktop migration bytes when the checkout is available", async () => {
    const { createHash } = await import("node:crypto");
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const migrationDirectory = resolve(
      process.cwd(),
      "..",
      "Quantify Terminal",
      "supabase",
      "migrations",
    );

    const observed = await Promise.all(
      DESKTOP_SUPABASE_MIGRATION_ARTIFACTS.map(async ({ filename }) => {
        try {
          const bytes = await readFile(resolve(migrationDirectory, filename));
          return { filename, sha256: createHash("sha256").update(bytes).digest("hex") };
        } catch {
          return null;
        }
      }),
    );
    if (observed.some((artifact) => artifact === null)) {
      expect(observed.every((artifact) => artifact === null)).toBe(true);
      return;
    }

    const real = observed as MigrationArtifact[];
    expect(real).toStrictEqual([...DESKTOP_SUPABASE_MIGRATION_ARTIFACTS]);

    const { report, check } = integrityCheck(real);

    expect(check?.status).toBe("pass");
    expect(report.sourceReady).toBe(true);
    expect(report.stagingReady).toBe(false);
    expect(report.productionReady).toBe(false);
  });

  it.each(DESKTOP_SUPABASE_MIGRATION_ARTIFACTS.map(({ filename }, index) => [filename, index]))(
    "blocks a single-byte digest drift in %s",
    (filename, index) => {
      const drifted = exactMigrationArtifacts();
      drifted[index as number] = {
        filename: filename as string,
        sha256: `${"0".repeat(63)}1`,
      };

      const { report, check } = integrityCheck(drifted);

      expect(check?.status).toBe("blocked");
      expect(check?.evidence).toEqual(
        expect.arrayContaining([
          expect.stringContaining(`Migration digest mismatch for ${filename}`),
        ]),
      );
      expect(report.sourceReady).toBe(false);
      expect(report.stagingReady).toBe(false);
      expect(report.productionReady).toBe(false);
    },
  );

  it("blocks unavailable or incomplete migration evidence", () => {
    const { report, check } = integrityCheck(null);

    expect(check?.status).toBe("blocked");
    expect(check?.evidence).toContain(
      "Desktop migration artifact evidence is unavailable or incomplete.",
    );
    expect(report.sourceReady).toBe(false);
  });

  it("blocks a missing migration artifact", () => {
    const { report, check } = integrityCheck(exactMigrationArtifacts().slice(0, 10));

    expect(check?.status).toBe("blocked");
    expect(check?.evidence).toEqual(
      expect.arrayContaining([
        "Expected exactly 11 migration artifacts, observed 10.",
        expect.stringContaining("Missing migration artifact at position 11"),
      ]),
    );
    expect(report.sourceReady).toBe(false);
  });

  it("blocks a reintroduced profile-photo Storage migration", () => {
    const withPhotoMigration = exactMigrationArtifacts();
    withPhotoMigration.splice(9, 0, {
      filename: "20260902000800_profile_photo_storage.sql",
      sha256: "c".repeat(64),
    });

    const { report, check } = integrityCheck(withPhotoMigration);

    expect(check?.status).toBe("blocked");
    expect(check?.evidence).toEqual(
      expect.arrayContaining([
        "Expected exactly 11 migration artifacts, observed 12.",
        "Unexpected migration artifact: 20260902000800_profile_photo_storage.sql",
      ]),
    );
    expect(report.sourceReady).toBe(false);
  });

  it("blocks reordered migrations even with correct digests", () => {
    const reordered = exactMigrationArtifacts();
    const first = reordered[0]!;
    reordered[0] = reordered[1]!;
    reordered[1] = first;

    const { report, check } = integrityCheck(reordered);

    expect(check?.status).toBe("blocked");
    expect(check?.evidence).toEqual(
      expect.arrayContaining([expect.stringContaining("Migration order mismatch at position 1")]),
    );
    expect(report.sourceReady).toBe(false);
  });

  it("blocks a renamed migration artifact", () => {
    const renamed = exactMigrationArtifacts();
    renamed[10] = {
      ...renamed[10]!,
      filename: "20260902001000_profile_contract_validation.copy.sql",
    };

    const { report, check } = integrityCheck(renamed);

    expect(check?.status).toBe("blocked");
    expect(check?.evidence).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Migration order mismatch at position 11"),
        expect.stringContaining("Unexpected migration artifact"),
      ]),
    );
    expect(report.sourceReady).toBe(false);
  });

  it("blocks an unpinned extra migration file", () => {
    const withExtra = [
      ...exactMigrationArtifacts(),
      { filename: "20260902001100_unpinned_extra.sql", sha256: "a".repeat(64) },
    ];

    const { report, check } = integrityCheck(withExtra);

    expect(check?.status).toBe("blocked");
    expect(check?.evidence).toEqual(
      expect.arrayContaining([
        "Expected exactly 11 migration artifacts, observed 12.",
        "Unexpected migration artifact: 20260902001100_unpinned_extra.sql",
      ]),
    );
    expect(report.sourceReady).toBe(false);
  });

  it("wires the real collector into the preflight snapshot", async () => {
    const { readFile } = await import("node:fs/promises");
    const collector = await readFile("scripts/preflight.ts", "utf8");

    // Behavioral coverage of the collector itself lives in migration-evidence.test.ts.
    expect(collector).toContain("collectDesktopSupabaseEvidence(desktopRoot)");
    expect(collector).toContain("desktopSupabaseMigrations: desktopSupabase.migrations");
  });

  it("blocks duplicate and extra migration artifacts", () => {
    const duplicated = [...exactMigrationArtifacts(), exactMigrationArtifacts()[0]!];

    const { report, check } = integrityCheck(duplicated);

    expect(check?.status).toBe("blocked");
    expect(check?.evidence).toEqual(
      expect.arrayContaining([
        "Expected exactly 11 migration artifacts, observed 12.",
        "Duplicate migration artifact: 20260902000000_local_baseline.sql",
      ]),
    );
    expect(report.sourceReady).toBe(false);
  });

  it("treats structural SQL checks as untrusted defense-in-depth, never as history proof", () => {
    // A destructive later statement is invisible to structural regular expressions.
    const report = buildPreflightReport({
      snapshot: {
        ...completeSnapshot,
        desktopSupabaseSchema: `${completeSnapshot.desktopSupabaseSchema}
          drop trigger trg_app_profiles_increment_version on public.app_profiles;`,
        desktopSupabaseMigrations: exactMigrationArtifacts(),
      },
      environment: validEnvironment,
      generatedAt: "2026-09-02T00:00:00.000Z",
    });

    const profileCheck = report.checks.find(({ id }) => id === "supabase.profile-contract");
    const integrity = report.checks.find(({ id }) => id === "supabase.migration-integrity");

    expect(profileCheck?.status).toBe("pass");
    expect(integrity?.evidence).toEqual(
      expect.arrayContaining(["Structural SQL checks are untrusted defense-in-depth only."]),
    );
    // Byte-level drift, not the structural checks, is what closes the gate.
    expect(reportWith(null).sourceReady).toBe(false);
  });
});
