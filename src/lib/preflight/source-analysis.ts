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

type LifecycleSources = {
  confirmRoute: string | null;
  resetAction: string | null;
  turnstileField: string | null;
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
}: LifecycleSources): PortalAuthLifecycleEvidence | null {
  if (!confirmRoute || !resetAction || !turnstileField) return null;

  const confirmFile = sourceFile(confirmRoute);
  const confirmBody = functionBody(confirmFile, "GET");
  const cleanupBody = functionBody(confirmFile, "clearRejectedExchange");
  const resetBody = functionBody(sourceFile(resetAction), "resetPassword");
  const turnstileBody = functionBody(sourceFile(turnstileField), "TurnstileField");
  if (!confirmBody || !cleanupBody || !resetBody || !turnstileBody) return null;

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
