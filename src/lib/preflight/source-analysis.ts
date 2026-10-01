import ts from "typescript";

import type { PortalAuthLifecycleEvidence, PortalSecurityEvidence } from "@/lib/preflight/model";

const REQUIRED_NO_STORE_ROUTES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/account/:path*",
  "/auth/:path*",
  "/connect/:path*",
] as const;

type HeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

export const SAME_ORIGIN_SERVER_ACTION_PATHS = [
  "src/app/account/actions.ts",
  "src/app/account/data/actions.ts",
  "src/app/account/notifications/actions.ts",
  "src/app/account/preferences/actions.ts",
  "src/app/account/profile/actions.ts",
  "src/app/account/security/actions.ts",
  "src/app/connect/desktop/actions.ts",
  "src/app/forgot-password/actions.ts",
  "src/app/login/actions.ts",
  "src/app/reset-password/actions.ts",
  "src/app/signup/actions.ts",
] as const;

type LifecycleSources = {
  confirmRoute: string | null;
  resetAction: string | null;
  turnstileField: string | null;
  securityActions: string | null;
  loginActions: string | null;
  accountGuard: string | null;
  profileAction: string | null;
  preferencesAction: string | null;
  sessionQuery: string | null;
  sessionLifecycle: string | null;
  accountDal: string | null;
  adminAccess: string | null;
  actionOrigin: string | null;
  serverActions: Readonly<Record<string, string | null>>;
};

function sourceFile(source: string): ts.SourceFile {
  return ts.createSourceFile(
    "evidence.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function functionBody(file: ts.SourceFile, name: string): ts.Block | null {
  let result: ts.Block | null = null;
  function visit(node: ts.Node): void {
    if (!result && ts.isFunctionDeclaration(node) && node.name?.text === name && node.body) {
      result = node.body;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return result;
}

function exportedAsyncFunctionBodies(file: ts.SourceFile): ts.Block[] {
  const bodies: ts.Block[] = [];
  function visit(node: ts.Node): void {
    if (
      ts.isFunctionDeclaration(node) &&
      node.body &&
      node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) &&
      node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
    ) {
      bodies.push(node.body);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return bodies;
}

function callName(call: ts.CallExpression): string | null {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
  return null;
}

function callsWithin(node: ts.Node): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  function visit(current: ts.Node): void {
    if (ts.isCallExpression(current)) calls.push(current);
    ts.forEachChild(current, visit);
  }
  visit(node);
  return calls.sort((left, right) => left.getStart() - right.getStart());
}

function callIndex(calls: ts.CallExpression[], name: string): number {
  return calls.findIndex((call) => callName(call) === name);
}

/**
 * A named call must appear, and must appear before every listed call that follows it.
 * Each listed call must appear too: a relationship that passes because one side is
 * absent would report "ordered" for an action that simply does not do the work.
 */
function callPrecedesAll(calls: ts.CallExpression[], first: string, followers: string[]): boolean {
  const firstIndex = callIndex(calls, first);
  if (firstIndex < 0) return false;
  return followers.every((name) => {
    const index = callIndex(calls, name);
    return index >= 0 && firstIndex < index;
  });
}

/**
 * The assurance decision must be compared and returned on, before anything is touched,
 * and the refusal must cover the unreadable case as well as the owed-factor case.
 *
 * Call ordering alone cannot tell "asked and refused" from "asked and ignored", and a
 * refusal placed after the mutation is not a gate. The `unavailable` half matters just
 * as much as `challenge-required`: an action that refuses only an owed factor and
 * proceeds on an unreadable factor inventory is treating "I could not tell" as "no
 * factors are enrolled", which is the exact substitution this evidence exists to deny.
 */
function refusesUnsatisfiedDecision(body: ts.Block, mutations: string[]): boolean {
  const mutationPositions = callsWithin(body)
    .filter((call) => {
      const name = callName(call);
      return name !== null && mutations.includes(name);
    })
    .map((call) => call.getStart())
    .sort((left, right) => left - right);
  if (mutationPositions.length === 0) return false;
  const firstMutation = Math.min(...mutationPositions);

  let coversUnreadable = false;
  function visit(node: ts.Node): void {
    if (ts.isIfStatement(node) && node.getStart() < firstMutation) {
      const condition = node.expression.getText().replaceAll(" ", "");
      const returnsEarly =
        ts.isReturnStatement(node.thenStatement) ||
        (ts.isBlock(node.thenStatement) &&
          node.thenStatement.statements.some((statement) => ts.isReturnStatement(statement)));
      // `!== "satisfied"` and `=== "unavailable"` both refuse an unreadable decision;
      // a lone `=== "challenge-required"` does not.
      const refusesUnreadable =
        condition.includes('decision!=="satisfied"') ||
        condition.includes('decision==="unavailable"');
      if (returnsEarly && refusesUnreadable) coversUnreadable = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(body);
  return coversUnreadable;
}

function includesEvery(source: string, needles: string[]): boolean {
  return needles.every((needle) => source.includes(needle));
}

function compactSource(source: string): string {
  return source.replace(/\s+/gu, "");
}

function hasSafeSessionActivityReads(source: string): boolean {
  const forbiddenColumns = [
    "provider_session_id",
    "metadata",
    "ip_address",
    "user_agent",
    "password",
    "passcode",
    "access_token",
    "refresh_token",
  ];
  const compactSource = source.replace(/\s+/gu, "");

  return (
    includesEvery(source, [
      "ACCOUNT_SESSIONS_ENDPOINT",
      "ACCOUNT_ACTIVITY_ENDPOINT",
      "fetchAccountApiSessions",
      "fetchAccountApiActivity",
      "mapAccountSessions",
      "mapAccountActivityEvents",
      "getAccessToken",
    ]) &&
    compactSource.includes("fetchAccountApiSessions(accessToken)") &&
    compactSource.includes("fetchAccountApiActivity(accessToken)") &&
    compactSource.includes("mapAccountSessions(userId,rows,options)") &&
    compactSource.includes("mapAccountActivityEvents(userId,rows)") &&
    !forbiddenColumns.some((column) => source.includes(column))
  );
}

function hasPortalSessionLifecycleHooks({
  lifecycle,
  accountDal,
  adminAccess,
}: {
  lifecycle: string;
  accountDal: string;
  adminAccess: string;
}): boolean {
  const compactDal = compactSource(accountDal);
  const compactAdminAccess = compactSource(adminAccess);
  return (
    includesEvery(lifecycle, [
      "registerCurrentAccountApiSession",
      "heartbeatCurrentAccountApiSession",
      "heartbeatAccountApiSession",
      "endCurrentAccountApiSession",
      '"sessions/register"',
      '"sessions/heartbeat"',
      '"sessions/end"',
      'device_name: "Web portal"',
      "postAccountApiJson",
      "idempotencyKey",
    ]) &&
    includesEvery(accountDal, [
      "requireCurrentAccount",
      "requireCurrentProfile",
      "requireCurrentSessions",
      "requireCurrentActivityEvents",
      "heartbeatProtectedAccountApiSession",
      "heartbeatCurrentAccountApiSession",
      "requireSatisfiedAssurance",
    ]) &&
    compactDal.includes(
      "awaitrequireSatisfiedAssurance();awaitheartbeatProtectedAccountApiSession();",
    ) &&
    includesEvery(adminAccess, ["fetchAccountApiMe", "heartbeatAccountApiSession"]) &&
    compactAdminAccess.includes(
      "constme=awaitfetchAccountApiMe(accessToken);awaitheartbeatAccountApiSession(accessToken);",
    )
  );
}

function hasSameOriginServerActionCoverage(
  serverActions: Readonly<Record<string, string | null>>,
): boolean {
  return SAME_ORIGIN_SERVER_ACTION_PATHS.every((path) => {
    const source = serverActions[path];
    if (!source) return false;
    const bodies = exportedAsyncFunctionBodies(sourceFile(source));
    return (
      bodies.length > 0 &&
      bodies.every((body) => callIndex(callsWithin(body), "requireSameOriginServerAction") >= 0)
    );
  });
}

export function analyzePortalAuthLifecycle({
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
  serverActions,
}: LifecycleSources): PortalAuthLifecycleEvidence | null {
  if (!confirmRoute || !resetAction || !turnstileField) return null;
  if (!securityActions || !loginActions || !accountGuard) return null;
  if (!profileAction || !preferencesAction) return null;
  if (!sessionQuery || !sessionLifecycle || !accountDal || !adminAccess) return null;

  const confirmFile = sourceFile(confirmRoute);
  const confirmBody = functionBody(confirmFile, "GET");
  const resetBody = functionBody(sourceFile(resetAction), "resetPassword");
  const turnstileBody = functionBody(sourceFile(turnstileField), "TurnstileField");
  if (!confirmBody || !resetBody || !turnstileBody) return null;

  const securityFile = sourceFile(securityActions);
  const changePasswordBody = functionBody(securityFile, "changePassword");
  const changeEmailBody = functionBody(securityFile, "changeEmail");
  const removeFactorBody = functionBody(securityFile, "removeTotpFactor");
  const startEnrollmentBody = functionBody(securityFile, "startTotpEnrollment");
  const confirmEnrollmentBody = functionBody(securityFile, "confirmTotpEnrollment");
  const loginBody = functionBody(sourceFile(loginActions), "login");
  const guardBody = functionBody(sourceFile(accountGuard), "requireSatisfiedAssurance");
  const mutationGuardBody = functionBody(sourceFile(accountGuard), "requireMutationAssurance");
  const updateProfileBody = functionBody(sourceFile(profileAction), "updateProfile");
  const updatePreferencesBody = functionBody(sourceFile(preferencesAction), "updatePreferences");
  if (!changePasswordBody || !changeEmailBody || !removeFactorBody) return null;
  if (!startEnrollmentBody || !confirmEnrollmentBody) return null;
  if (!loginBody || !guardBody || !mutationGuardBody) return null;
  if (!updateProfileBody || !updatePreferencesBody) return null;

  const confirmCalls = callsWithin(confirmBody);
  const resetCalls = callsWithin(resetBody);
  const turnstileCalls = callsWithin(turnstileBody);

  const confirmText = confirmBody.getText();
  const resetText = resetBody.getText();
  const confirmConfigIndex = callIndex(confirmCalls, "getAzureAuthConfig");
  const confirmEmailIndex = callIndex(confirmCalls, "confirmEmail");
  const resetConfigIndex = callIndex(resetCalls, "getAzureAuthConfig");
  const resetUpdateIndex = callIndex(resetCalls, "resetPassword");
  const resetClearIndex = callIndex(resetCalls, "clearRecoveryAuthorization");

  const passwordCalls = callsWithin(changePasswordBody);
  const emailCalls = callsWithin(changeEmailBody);
  const removalCalls = callsWithin(removeFactorBody);
  const startEnrollmentCalls = callsWithin(startEnrollmentBody);
  const confirmEnrollmentCalls = callsWithin(confirmEnrollmentBody);
  const loginCalls = callsWithin(loginBody);
  const guardCalls = callsWithin(guardBody);
  const mutationGuardCalls = callsWithin(mutationGuardBody);
  const updateProfileCalls = callsWithin(updateProfileBody);
  const updatePreferencesCalls = callsWithin(updatePreferencesBody);

  const passwordVerifyIndex = callIndex(passwordCalls, "verifyCurrentPassword");
  const passwordUpdateIndex = callIndex(passwordCalls, "updatePassword");
  const emailVerifyIndex = callIndex(emailCalls, "verifyCurrentPassword");
  const emailUpdateIndex = callIndex(emailCalls, "updateUser");
  const removalVerifyIndex = callIndex(removalCalls, "verifyCurrentPassword");
  const removalUnenrollIndex = callIndex(removalCalls, "unenroll");
  const enrollmentVerifyIndex = callIndex(startEnrollmentCalls, "verifyCurrentPassword");
  const enrollmentEnrollIndex = callIndex(startEnrollmentCalls, "enroll");
  const loginSignInIndex = callIndex(loginCalls, "signInWithPassword");
  const loginRegisterIndex = callIndex(loginCalls, "registerCurrentAccountApiSession");
  const loginRedirectIndex = callIndex(loginCalls, "redirect");
  const confirmOwnershipIndex = confirmEnrollmentCalls.findIndex(
    (call) =>
      callName(call) === "includes" &&
      call.expression.getText().includes("unverifiedTotpFactorIds"),
  );
  const confirmChallengeIndex = callIndex(confirmEnrollmentCalls, "challenge");

  return {
    callbackUsesTrustedRedirectType:
      includesEvery(confirmText, [
        'getAll("token")',
        "token.length > 4_096",
        "getAzureAuthConfig",
        "confirmEmail(token)",
        "/auth/confirmed",
        "invalid-confirm-link",
      ]) &&
      confirmConfigIndex >= 0 &&
      confirmEmailIndex >= 0 &&
      confirmConfigIndex < confirmEmailIndex,
    callbackIssuesRecoveryAuthorization:
      includesEvery(resetText, [
        'formData.get("token")',
        "token.length > 4_096",
        "new AzureAuthClient(config.apiUrl)",
        "resetPassword(token, parsed.data.password)",
        "clearRecoveryAuthorization",
      ]) &&
      resetConfigIndex >= 0 &&
      resetUpdateIndex >= 0 &&
      resetClearIndex >= 0 &&
      resetConfigIndex < resetUpdateIndex &&
      resetUpdateIndex < resetClearIndex,
    callbackClearsRejectedExchange:
      (confirmText.match(/invalid-confirm-link/gu)?.length ?? 0) >= 2 &&
      !confirmText.includes("setSession") &&
      !confirmText.includes("writeSession"),
    resetRequiresVerifiedSession:
      includesEvery(resetText, [
        "const token =",
        "token.length > 4_096",
        "requireSameOriginServerAction",
      ]) &&
      resetConfigIndex >= 0 &&
      resetUpdateIndex >= 0 &&
      resetConfigIndex < resetUpdateIndex,
    resetConsumesAuthorizationBeforeUpdate:
      resetUpdateIndex >= 0 && resetClearIndex >= 0 && resetUpdateIndex < resetClearIndex,
    turnstileResetsAfterSubmission:
      turnstileBody.getText().includes("wasDisabled.current && !disabled") &&
      callIndex(turnstileCalls, "reset") >= 0,
    // Every change to the account's credentials or factors reauthenticates before it
    // mutates anything, enrollment included: adding a factor raises the required level
    // for every session of the account, so it is not a self-authorizing operation.
    securityReauthenticatesBeforeMutation:
      passwordVerifyIndex >= 0 &&
      passwordVerifyIndex < passwordUpdateIndex &&
      emailVerifyIndex >= 0 &&
      emailUpdateIndex < 0 &&
      removalVerifyIndex >= 0 &&
      removalUnenrollIndex < 0 &&
      enrollmentVerifyIndex < 0 &&
      enrollmentEnrollIndex < 0 &&
      startEnrollmentBody.getText().includes("source-locked") &&
      confirmEnrollmentBody.getText().includes("source-locked") &&
      removeFactorBody.getText().includes("source-locked"),
    // Azure password auth redirects only after a session exists and lifecycle is recorded.
    loginRequiresSatisfiedAssurance:
      loginSignInIndex >= 0 &&
      loginRegisterIndex >= 0 &&
      loginSignInIndex < loginRegisterIndex &&
      (loginRedirectIndex < 0 || loginRegisterIndex < loginRedirectIndex) &&
      !loginBody.getText().includes("resolveAssuranceState"),
    // Protected routes refuse an unsatisfied session instead of rendering it.
    accountGuardEnforcesAssurance:
      callIndex(guardCalls, "getCurrentAssurance") >= 0 &&
      callIndex(guardCalls, "redirect") >= 0 &&
      guardBody.getText().includes("assurance.challengeRequired") &&
      // The action-side counterpart returns the decision instead of redirecting.
      callIndex(mutationGuardCalls, "getCurrentAssurance") >= 0 &&
      callIndex(mutationGuardCalls, "assuranceForMutation") >= 0,
    // Each security action is its own endpoint, so each one asks for the assurance
    // decision before it checks a password or touches the account — and acts on the
    // answer. Ordering alone would pass for an action that discards the decision.
    securityActionsRequireAssurance:
      refusesUnsatisfiedDecision(changePasswordBody, ["verifyCurrentPassword", "updatePassword"]) &&
      refusesUnsatisfiedDecision(changeEmailBody, [
        "createServerAzureClient",
        "verifyCurrentPassword",
      ]) &&
      refusesUnsatisfiedDecision(startEnrollmentBody, ["createServerAzureClient"]) &&
      refusesUnsatisfiedDecision(confirmEnrollmentBody, ["createServerAzureClient"]) &&
      refusesUnsatisfiedDecision(removeFactorBody, [
        "createServerAzureClient",
        "verifyCurrentPassword",
      ]) &&
      callPrecedesAll(passwordCalls, "requireMutationAssurance", [
        "verifyCurrentPassword",
        "updatePassword",
      ]) &&
      callPrecedesAll(emailCalls, "requireMutationAssurance", [
        "createServerAzureClient",
        "verifyCurrentPassword",
      ]) &&
      callPrecedesAll(startEnrollmentCalls, "requireMutationAssurance", [
        "createServerAzureClient",
      ]) &&
      callPrecedesAll(confirmEnrollmentCalls, "requireMutationAssurance", [
        "createServerAzureClient",
      ]) &&
      callPrecedesAll(removalCalls, "requireMutationAssurance", [
        "createServerAzureClient",
        "verifyCurrentPassword",
      ]),
    // The same requirement on the two profile mutations behind the account pages.
    accountActionsRequireAssurance:
      refusesUnsatisfiedDecision(updateProfileBody, ["getUser", "updateAccountApiProfile"]) &&
      refusesUnsatisfiedDecision(updatePreferencesBody, ["getUser", "updateAccountApiProfile"]) &&
      callPrecedesAll(updateProfileCalls, "requireMutationAssurance", [
        "getUser",
        "updateAccountApiProfile",
      ]) &&
      callPrecedesAll(updatePreferencesCalls, "requireMutationAssurance", [
        "getUser",
        "updateAccountApiProfile",
      ]),
    // A submitted factor id is only ever challenged after the provider confirms it is
    // this caller's own pending enrollment.
    // The call list is ordered by source position, so an earlier index is an earlier
    // statement.
    enrollmentBindsProviderIssuedFactor:
      confirmOwnershipIndex >= 0 &&
      confirmChallengeIndex < 0 &&
      confirmEnrollmentBody.getText().includes("source-locked"),
    sessionQueriesUseSafeReadColumns: hasSafeSessionActivityReads(sessionQuery),
    portalSessionLifecycleHooks: hasPortalSessionLifecycleHooks({
      lifecycle: sessionLifecycle,
      accountDal,
      adminAccess,
    }),
    serverActionsRequireSameOrigin:
      Boolean(actionOrigin) &&
      includesEvery(actionOrigin ?? "", [
        "headers",
        "origin",
        "referer",
        "NEXT_PUBLIC_SITE_URL",
        "SameOriginActionError",
        'process.env.NODE_ENV !== "production"',
      ]) &&
      hasSameOriginServerActionCoverage(serverActions),
  };
}

export function analyzePortalSecurityHeaders(
  rules: HeaderRule[] | null,
): PortalSecurityEvidence | null {
  if (!rules) return null;

  const globalRule = rules.find(({ source }) => source === "/:path*");
  const contentSecurityPolicy = globalRule?.headers.find(
    ({ key }) => key === "Content-Security-Policy",
  )?.value;
  const hasReportOnlyPolicy = rules.some(({ headers }) =>
    headers.some(({ key }) => key === "Content-Security-Policy-Report-Only"),
  );
  const noStoreRoutes = rules
    .filter(({ headers }) =>
      headers.some(
        ({ key, value }) =>
          key === "Cache-Control" &&
          value
            .split(",")
            .map((directive) => directive.trim())
            .includes("no-store"),
      ),
    )
    .map(({ source }) => source)
    .sort();

  return {
    enforcedChallengeCompatibleCsp:
      !hasReportOnlyPolicy &&
      Boolean(contentSecurityPolicy?.includes("script-src")) &&
      Boolean(contentSecurityPolicy?.includes("https://challenges.cloudflare.com")) &&
      Boolean(contentSecurityPolicy?.includes("https://*.azurewebsites.net")) &&
      !contentSecurityPolicy?.includes("supabase.co") &&
      !contentSecurityPolicy?.includes("'unsafe-eval'"),
    exactNoStoreRoutes:
      JSON.stringify(noStoreRoutes) === JSON.stringify([...REQUIRED_NO_STORE_ROUTES].sort()),
    noStoreRoutes,
  };
}
