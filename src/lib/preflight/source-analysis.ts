import ts from "typescript";

import type { PortalAuthLifecycleEvidence, PortalSecurityEvidence } from "@/lib/preflight/model";

const REQUIRED_NO_STORE_ROUTES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/account/:path*",
  "/admin/:path*",
  "/auth/:path*",
] as const;

type HeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

/**
 * Everything a security action must not reach before the assurance decision is made:
 * the provider mutations themselves, plus the password verification, which would
 * otherwise turn a refused action into a credential oracle.
 */
const MUTATION_CALLS = [
  "verifyCurrentPassword",
  "updateUser",
  "enroll",
  "unenroll",
  "challenge",
  "verify",
] as const satisfies readonly string[];

type LifecycleSources = {
  confirmRoute: string | null;
  resetAction: string | null;
  turnstileField: string | null;
  securityActions: string | null;
  loginActions: string | null;
  accountGuard: string | null;
  profileAction: string | null;
  preferencesAction: string | null;
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

function callHasArgument(calls: ts.CallExpression[], name: string, expectedText: string): boolean {
  return calls.some(
    (call) =>
      callName(call) === name &&
      call.arguments.some((argument) => argument.getText() === expectedText),
  );
}

function callHasObjectProperties(
  calls: ts.CallExpression[],
  name: string,
  expectedProperties: Record<string, string>,
): boolean {
  return calls.some((call) => {
    if (callName(call) !== name) return false;
    const argument = call.arguments[0];
    if (!argument || !ts.isObjectLiteralExpression(argument)) return false;
    const properties = new Map<string, string>();
    for (const property of argument.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      properties.set(property.name.getText(), property.initializer.getText());
    }
    return Object.entries(expectedProperties).every(
      ([key, value]) => properties.get(key) === value,
    );
  });
}

function hasRedirectTypeNarrowing(body: ts.Block): boolean {
  let narrowed = false;
  function visit(node: ts.Node): void {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.InKeyword &&
      ts.isStringLiteral(node.left) &&
      node.left.text === "redirectType" &&
      node.right.getText() === "result.data"
    ) {
      narrowed = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(body);
  return narrowed;
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

function hasAuthorizationRejectionBeforeUpdate(body: ts.Block): boolean {
  let authorizedDeclaration = -1;
  let authorizationRejection = -1;
  let update = -1;

  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && node.name.getText() === "authorized") {
      const initializer = node.initializer;
      if (
        initializer &&
        callsWithin(initializer).some((call) => callName(call) === "consumeRecoveryAuthorization")
      ) {
        authorizedDeclaration = node.getStart();
      }
    }
    if (ts.isIfStatement(node) && node.expression.getText().replaceAll(" ", "") === "!authorized") {
      authorizationRejection = node.getStart();
    }
    if (ts.isCallExpression(node) && callName(node) === "updateUser" && update === -1) {
      update = node.getStart();
    }
    ts.forEachChild(node, visit);
  }
  visit(body);

  return (
    authorizedDeclaration >= 0 &&
    authorizedDeclaration < authorizationRejection &&
    authorizationRejection < update
  );
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
}: LifecycleSources): PortalAuthLifecycleEvidence | null {
  if (!confirmRoute || !resetAction || !turnstileField) return null;
  if (!securityActions || !loginActions || !accountGuard) return null;
  if (!profileAction || !preferencesAction) return null;

  const confirmFile = sourceFile(confirmRoute);
  const confirmBody = functionBody(confirmFile, "GET");
  const cleanupBody = functionBody(confirmFile, "clearRejectedExchange");
  const resetBody = functionBody(sourceFile(resetAction), "resetPassword");
  const turnstileBody = functionBody(sourceFile(turnstileField), "TurnstileField");
  if (!confirmBody || !cleanupBody || !resetBody || !turnstileBody) return null;

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
  const cleanupCalls = callsWithin(cleanupBody);
  const resetCalls = callsWithin(resetBody);
  const turnstileCalls = callsWithin(turnstileBody);

  const exchangeIndex = callIndex(confirmCalls, "exchangeCodeForSession");
  const destinationIndex = callIndex(confirmCalls, "resolveTrustedAuthDestination");
  const issueIndex = callIndex(confirmCalls, "issueRecoveryAuthorization");
  const getSessionIndex = callIndex(resetCalls, "getSession");
  const getUserIndex = callIndex(resetCalls, "getUser");
  const consumeIndex = callIndex(resetCalls, "consumeRecoveryAuthorization");
  const updateIndex = callIndex(resetCalls, "updateUser");

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
  const passwordUpdateIndex = callIndex(passwordCalls, "updateUser");
  const emailVerifyIndex = callIndex(emailCalls, "verifyCurrentPassword");
  const emailUpdateIndex = callIndex(emailCalls, "updateUser");
  const removalVerifyIndex = callIndex(removalCalls, "verifyCurrentPassword");
  const removalUnenrollIndex = callIndex(removalCalls, "unenroll");
  const enrollmentVerifyIndex = callIndex(startEnrollmentCalls, "verifyCurrentPassword");
  const enrollmentEnrollIndex = callIndex(startEnrollmentCalls, "enroll");
  const loginSignInIndex = callIndex(loginCalls, "signInWithPassword");
  const loginAssuranceIndex = callIndex(loginCalls, "resolveAssuranceState");
  const loginRedirectIndex = callIndex(loginCalls, "redirect");
  const confirmOwnershipIndex = confirmEnrollmentCalls.findIndex(
    (call) =>
      callName(call) === "includes" &&
      call.expression.getText().includes("unverifiedTotpFactorIds"),
  );
  const confirmChallengeIndex = callIndex(confirmEnrollmentCalls, "challenge");

  return {
    callbackUsesTrustedRedirectType:
      exchangeIndex >= 0 &&
      exchangeIndex < destinationIndex &&
      hasRedirectTypeNarrowing(confirmBody) &&
      callHasArgument(confirmCalls, "resolveTrustedAuthDestination", "redirectType"),
    callbackIssuesRecoveryAuthorization:
      destinationIndex >= 0 &&
      destinationIndex < issueIndex &&
      callHasObjectProperties(confirmCalls, "issueRecoveryAuthorization", {
        userId: "result.data.user.id",
        accessToken: "result.data.session.access_token",
        secure: "cookieOptions.secure === true",
      }),
    callbackClearsRejectedExchange:
      callIndex(confirmCalls, "clearRejectedExchange") >= 0 &&
      callIndex(cleanupCalls, "clearPortalSupabaseAuthCookies") >= 0 &&
      callIndex(cleanupCalls, "clearRecoveryAuthorization") >= 0,
    resetRequiresVerifiedSession:
      getSessionIndex >= 0 &&
      getSessionIndex < getUserIndex &&
      callHasArgument(resetCalls, "getUser", "session.access_token"),
    resetConsumesAuthorizationBeforeUpdate:
      getUserIndex >= 0 &&
      getUserIndex < consumeIndex &&
      consumeIndex < updateIndex &&
      hasAuthorizationRejectionBeforeUpdate(resetBody),
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
      emailVerifyIndex < emailUpdateIndex &&
      removalVerifyIndex >= 0 &&
      removalVerifyIndex < removalUnenrollIndex &&
      enrollmentVerifyIndex >= 0 &&
      enrollmentVerifyIndex < enrollmentEnrollIndex,
    // A password alone must not complete a sign-in that still owes a second factor.
    loginRequiresSatisfiedAssurance:
      loginSignInIndex >= 0 &&
      loginSignInIndex < loginAssuranceIndex &&
      (loginRedirectIndex < 0 || loginAssuranceIndex < loginRedirectIndex) &&
      loginBody.getText().includes("assurance.challengeRequired"),
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
      refusesUnsatisfiedDecision(changePasswordBody, [...MUTATION_CALLS]) &&
      refusesUnsatisfiedDecision(changeEmailBody, [...MUTATION_CALLS]) &&
      refusesUnsatisfiedDecision(startEnrollmentBody, [...MUTATION_CALLS]) &&
      refusesUnsatisfiedDecision(confirmEnrollmentBody, [...MUTATION_CALLS]) &&
      refusesUnsatisfiedDecision(removeFactorBody, [...MUTATION_CALLS]) &&
      callPrecedesAll(passwordCalls, "requireMutationAssurance", [
        "verifyCurrentPassword",
        "updateUser",
      ]) &&
      callPrecedesAll(emailCalls, "requireMutationAssurance", [
        "verifyCurrentPassword",
        "updateUser",
      ]) &&
      callPrecedesAll(startEnrollmentCalls, "requireMutationAssurance", [
        "verifyCurrentPassword",
        "enroll",
      ]) &&
      callPrecedesAll(confirmEnrollmentCalls, "requireMutationAssurance", [
        "challenge",
        "verify",
      ]) &&
      callPrecedesAll(removalCalls, "requireMutationAssurance", [
        "verifyCurrentPassword",
        "unenroll",
      ]),
    // The same requirement on the two profile mutations behind the account pages.
    accountActionsRequireAssurance:
      refusesUnsatisfiedDecision(updateProfileBody, ["rpc"]) &&
      refusesUnsatisfiedDecision(updatePreferencesBody, ["rpc"]) &&
      callPrecedesAll(updateProfileCalls, "requireMutationAssurance", ["getUser", "rpc"]) &&
      callPrecedesAll(updatePreferencesCalls, "requireMutationAssurance", ["getUser", "rpc"]),
    // A submitted factor id is only ever challenged after the provider confirms it is
    // this caller's own pending enrollment.
    // The call list is ordered by source position, so an earlier index is an earlier
    // statement.
    enrollmentBindsProviderIssuedFactor:
      confirmOwnershipIndex >= 0 &&
      confirmChallengeIndex >= 0 &&
      confirmOwnershipIndex < confirmChallengeIndex,
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
      Boolean(contentSecurityPolicy?.includes("https://*.supabase.co")) &&
      !contentSecurityPolicy?.includes("'unsafe-eval'"),
    exactNoStoreRoutes:
      JSON.stringify(noStoreRoutes) === JSON.stringify([...REQUIRED_NO_STORE_ROUTES].sort()),
    noStoreRoutes,
  };
}
