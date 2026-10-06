import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { resolveDesktopRoot } from "@/lib/preflight/desktop-root";

/**
 * The console must call routes the service has, and the mock must not be more permissive.
 *
 * A bug of exactly this shape shipped: `createAccountApiBrokerConnection` posted to
 * `me/brokers`, which the service registers GET-only, so every connect attempt in production
 * was refused — while `npm run check:console-ui` passed, because the mock happened to answer
 * POST on that path too.
 *
 * That is the part worth guarding. A mock that is stricter than the service only fails a
 * local check; a mock that is LOOSER certifies a request production will refuse. These tests
 * read the service's own route table and hold both the client and the mock against it.
 */

const PACKAGE_ROOT = resolve(resolveDesktopRoot(), "cloud/azure/account_function");

async function read(relative: string): Promise<string> {
  return readFile(resolve(PACKAGE_ROOT, relative), "utf8");
}

/**
 * These cases read the sibling desktop checkout, which a portal-only checkout does not
 * have — and CI clones one repository. Without this the three cases below did not report
 * a parity problem, they reported `ENOENT` on a directory that was never going to be
 * there, and every push since has mailed "Portal CI failed" about it. A check that cannot
 * pass in the environment it runs in is not a check.
 *
 * Skipping is the same decision `account-api-analysis.test.ts` already took for the same
 * files, for the same reason, and it is safe in the same way: the integrated workspace is
 * where this evidence is gated, and that is where the parity bug this test exists for
 * (a console POST to a GET-only `me/brokers`) would be caught.
 */
const packageAvailable = await read("account_api/app.py").then(
  () => true,
  () => false,
);

/** Every route the service registers, with the method it accepts.
 *
 * Route names are module constants and NOT all of them live in `app.py` — the auth ones are
 * imported from `auth_routes`, and their names do not contain "ROUTE" either. A parser that
 * looked only at `app.py` reported `auth/user/profile` as a route the service does not have,
 * which is a false alarm, and a test that cries wolf gets deleted. So constants are gathered
 * from every module in the package.
 */
async function serviceRoutes(): Promise<Map<string, string>> {
  const modules = await readdir(resolve(PACKAGE_ROOT, "account_api"));
  const constants = new Map<string, string>();
  for (const name of modules.filter((file) => file.endsWith(".py"))) {
    const source = await read(`account_api/${name}`);
    for (const match of source.matchAll(/^([A-Z][A-Z0-9_]*)\s*=\s*"([^"]+)"/gmu)) {
      const [, constant, value] = match;
      if (constant && value && !constants.has(constant)) constants.set(constant, value);
    }
  }

  // Registrations look like `BROKERS_ROUTE: RouteEntry("GET", ...)`.
  const source = await read("account_api/app.py");
  const routes = new Map<string, string>();
  for (const match of source.matchAll(
    /([A-Z][A-Z0-9_]*):\s*RouteEntry\(\s*"(GET|POST|PUT|PATCH|DELETE)"/gu,
  )) {
    const [, name, method] = match;
    const path = name ? constants.get(name) : undefined;
    if (path && method) routes.set(path, method);
  }
  return routes;
}

/**
 * A concrete path for a route template, for testing a mock's regular expression against it.
 * The samples are shaped like real values, because some mock patterns check shape: a date
 * for a brief, a long url-safe token for a handoff id, a uuid for everything else.
 */
function sampleOf(template: string): string {
  return template
    .split("/")
    .map((segment) => {
      if (!segment.startsWith("{")) return segment;
      if (segment.includes("date")) return "2026-10-01";
      if (segment.includes("handoff")) return "A".repeat(43);
      return "5c1f7b90-0a2e-4f3b-9d61-7c2a4e6b8d01";
    })
    .join("/");
}

/** The mock's exact guards: `route === "x" && method === "Y"`, in either order. */
function exactGuards(mock: string): Array<{ path: string; method: string }> {
  const guarded: Array<{ path: string; method: string }> = [];
  for (const match of mock.matchAll(
    /route === "([^"]+)"\s*&&\s*method === "(GET|POST|PUT|PATCH|DELETE)"/gu,
  )) {
    const [, path, method] = match;
    if (path && method) guarded.push({ path, method });
  }
  for (const match of mock.matchAll(
    /method === "(GET|POST|PUT|PATCH|DELETE)"\s*&&\s*route === "([^"]+)"/gu,
  )) {
    const [, method, path] = match;
    if (path && method) guarded.push({ path, method });
  }
  return guarded;
}

/**
 * The mock's pattern guards: a `const x = route.match(/.../u)` (or `/.../u.exec(route)`)
 * followed by `if (x && method === "Y")`. These answer the templated routes — a revoke by id,
 * a brief by date — which the exact-guard check above cannot see, and a templated route is
 * just as able to be more permissive than the service.
 */
function patternGuards(mock: string): Array<{ name: string; pattern: RegExp; method: string }> {
  const patterns = new Map<string, RegExp>();
  for (const match of mock.matchAll(
    /const (\w+) = route\.match\(\s*\/(.+?)\/([a-z]*)\s*,?\s*\)/gu,
  )) {
    const [, name, body, flags] = match;
    if (name && body) patterns.set(name, new RegExp(body, flags));
  }
  for (const match of mock.matchAll(/const (\w+) = \/(.+?)\/([a-z]*)\.exec\(route\)/gu)) {
    const [, name, body, flags] = match;
    if (name && body) patterns.set(name, new RegExp(body, flags));
  }
  const guards: Array<{ name: string; pattern: RegExp; method: string }> = [];
  for (const match of mock.matchAll(/\b(\w+) && method === "(GET|POST|PUT|PATCH|DELETE)"/gu)) {
    const [, name, method] = match;
    const pattern = name ? patterns.get(name) : undefined;
    if (name && pattern && method) guards.push({ name, pattern, method });
  }
  return guards;
}

/** The string literals in one Python `frozenset({...})` assignment, comments dropped. */
function pythonStringSet(source: string, name: string): string[] {
  const start = source.indexOf(`${name}: frozenset[str] = frozenset(`);
  if (start === -1) return [];
  const end = source.indexOf("\n)", start);
  const block = source
    .slice(start, end)
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  return [...block.matchAll(/"([^"]+)"/gu)].map((match) => match[1]!);
}

/** Turn `me/brokers/{connection_id}/test` into a matcher for a concrete path. */
function toPattern(route: string): RegExp {
  const escaped = route
    .split("/")
    .map((segment) =>
      segment.startsWith("{") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"),
    )
    .join("/");
  return new RegExp(`^${escaped}$`, "u");
}

describe("desktop checkout resolution", () => {
  // Outside the skipped block on purpose: a portal-only run must still prove it skipped
  // for the right reason rather than because the resolver quietly returned nothing.
  it("resolves the sibling desktop checkout to a path", () => {
    expect(PACKAGE_ROOT.endsWith("cloud/azure/account_function")).toBe(true);
  });
});

describe.skipIf(!packageAvailable)("route parity with the Account API", () => {
  it("reads a route table from the service at all", async () => {
    const routes = await serviceRoutes();
    // A parser that silently found nothing would make every test below vacuous.
    expect(routes.size).toBeGreaterThan(50);
    expect(routes.get("me/brokers")).toBe("GET");
    expect(routes.get("me/brokers/create")).toBe("POST");
    // Imported from `auth_routes`, which is what the first parser missed.
    expect(routes.get("auth/user/profile")).toBe("GET");
  });

  it("sends every request to a path and method the service accepts", async () => {
    const routes = await serviceRoutes();
    const client = await readFile(resolve("src/lib/admin/account-api.ts"), "utf8");

    // `fetchAccountApiJson("me", ...)` is a GET; `postAccountApiJson("me/brokers/create", ...)`
    // is a POST. Template literals keep their `${...}` holes, which match a `{param}` segment.
    const calls: Array<{ path: string; method: string }> = [];
    for (const match of client.matchAll(
      /(fetchAccountApiJson|postAccountApiJson)\(\s*[`"]([^`"]+)[`"]/gu,
    )) {
      const [, fn, raw] = match;
      if (!raw) continue;
      calls.push({
        path: raw.replace(/\$\{[^}]*\}/gu, "PARAM"),
        method: fn === "postAccountApiJson" ? "POST" : "GET",
      });
    }
    expect(calls.length).toBeGreaterThan(20);

    const offenders = calls.filter(({ path, method }) => {
      const concrete = path.replace(/PARAM/gu, "x");
      for (const [route, accepts] of routes) {
        if (toPattern(route).test(concrete)) return accepts !== method;
      }
      return true; // no route matches at all
    });

    expect(
      offenders.map((o) => `${o.method} ${o.path}`),
      "these console calls do not match any route the service accepts",
    ).toEqual([]);
  });

  it("never answers a method on a path the service refuses", async () => {
    const routes = await serviceRoutes();
    const mock = await readFile(resolve("scripts/mock-account-api.ts"), "utf8");

    // The mock guards look like `if (route === "me/brokers" && method === "GET")`.
    const guarded = exactGuards(mock);
    expect(guarded.length).toBeGreaterThan(3);

    const looser = guarded.filter(({ path, method }) => {
      const accepts = routes.get(path);
      // A path the service does not have at all is a mock-only convenience, which is its own
      // problem but not this one; a path it HAS with a different method is the bug.
      return accepts !== undefined && accepts !== method;
    });

    expect(
      looser.map(
        (o) => `mock answers ${o.method} ${o.path}, service accepts ${routes.get(o.path)}`,
      ),
      "the mock is more permissive than the service, which is how a broken call passes locally",
    ).toEqual([]);
  });

  it("never answers a method on a templated path the service refuses", async () => {
    const routes = await serviceRoutes();
    const mock = await readFile(resolve("scripts/mock-account-api.ts"), "utf8");
    const guards = patternGuards(mock);
    // The revoke-by-id and the brief-by-date guards at least; none found means the parser
    // broke, not that the mock is clean.
    expect(guards.map((guard) => guard.name)).toEqual(
      expect.arrayContaining(["authorisationRevokeMatch", "overnightRead", "overnightWrite"]),
    );

    const looser: string[] = [];
    for (const guard of guards) {
      for (const [template, accepts] of routes) {
        if (guard.pattern.test(sampleOf(template)) && accepts !== guard.method) {
          looser.push(`mock answers ${guard.method} ${template}, service accepts ${accepts}`);
        }
      }
    }
    expect(looser, "a templated mock route is more permissive than the service").toEqual([]);
  });

  it("answers every live-order gate and step-up route at the service's path and method", async () => {
    const routes = await serviceRoutes();
    const mock = await readFile(resolve("scripts/mock-account-api.ts"), "utf8");
    const brokerSource = await read("account_api/broker_routes.py");
    const stepUpSource = await read("account_api/step_up.py");

    // Every route `broker_routes` declares (kill switch, resume, confirm, the authorisations)
    // and step-up, read from the service so a gate added later is covered without editing
    // this list — plus the existing routes whose shapes the same change touched.
    const declared = [
      ...[...brokerSource.matchAll(/^[A-Z_]+_ROUTE\s*=\s*"([^"]+)"/gmu)].map((m) => m[1]!),
      ...[...stepUpSource.matchAll(/^STEP_UP_ROUTE\s*=\s*"([^"]+)"/gmu)].map((m) => m[1]!),
      "me/brokers",
      "me/brokers/orders/preview",
      "account/deletion/request",
      "account/deletion/cancel",
    ];
    expect(declared).toEqual(
      expect.arrayContaining([
        "auth/step-up",
        "me/brokers/kill-switch",
        "me/brokers/trading/resume",
        "me/brokers/authorisations/{authorisation_id}/revoke",
      ]),
    );

    const exact = exactGuards(mock);
    const patterns = patternGuards(mock);
    const problems: string[] = [];
    for (const template of declared) {
      const accepts = routes.get(template);
      if (!accepts) {
        problems.push(`the service registers no ${template}`);
        continue;
      }
      const answered = template.includes("{")
        ? patterns.filter((guard) => guard.pattern.test(sampleOf(template))).map((g) => g.method)
        : exact.filter((guard) => guard.path === template).map((guard) => guard.method);
      if (answered.length === 0) problems.push(`the mock does not answer ${accepts} ${template}`);
      for (const method of answered) {
        if (method !== accepts)
          problems.push(`mock answers ${method} ${template}, service ${accepts}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("holds an unadmitted account to the same open routes as the service's access gate", async () => {
    const access = await read("account_api/access.py");
    const mock = await readFile(resolve("scripts/mock-account-api.ts"), "utf8");

    const service = pythonStringSet(access, "OPEN_ROUTES").sort();
    // A parser that found nothing would make the comparison vacuous.
    expect(service).toEqual(expect.arrayContaining(["me", "account/deletion/request"]));

    const start = mock.indexOf("const MOCK_OPEN_ROUTES: readonly string[] = [");
    const block = mock.slice(start, mock.indexOf("];", start));
    const mocked = [...block.matchAll(/"([^"]+)"/gu)].map((match) => match[1]!).sort();

    expect(mocked, "the mock's access gate must open exactly what the service's opens").toEqual(
      service,
    );
  });
});
