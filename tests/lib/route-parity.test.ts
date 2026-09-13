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

describe("route parity with the Account API", () => {
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
    const guarded: Array<{ path: string; method: string }> = [];
    // Both orders occur in the mock: `route === x && method === y` and the reverse.
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
});
