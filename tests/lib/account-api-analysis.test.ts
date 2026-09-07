import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  ACCOUNT_API_MODULES,
  analyzeAccountApi,
  CONSTRUCT_ONLY_PROPERTIES,
  FULLY_PINNED_PROPERTIES,
  type AccountApiSources,
} from "@/lib/preflight/account-api-analysis";
import { resolveDesktopRoot } from "@/lib/preflight/desktop-root";

// The same resolver the evidence collector uses, so this suite and the preflight always
// read the same files.
const PACKAGE_ROOT = resolve(resolveDesktopRoot(), "cloud/azure/account_function");

async function read(path: string): Promise<string | null> {
  try {
    return await readFile(resolve(PACKAGE_ROOT, path), "utf8");
  } catch {
    return null;
  }
}

async function realSources(): Promise<AccountApiSources> {
  const modules = Object.fromEntries(
    await Promise.all(
      ACCOUNT_API_MODULES.map(
        async (name) => [name, await read(`account_api/${name}.py`)] as const,
      ),
    ),
  );
  return {
    functionApp: await read("function_app.py"),
    hostJson: await read("host.json"),
    requirements: await read("requirements.txt"),
    infrastructure: await read("infra/main.bicep"),
    modules,
  };
}

/**
 * These cases read the sibling desktop checkout. A portal-only checkout is a supported
 * configuration — CI clones one repository — so the suite reports the absence once and
 * skips rather than failing twenty assertions about files that were never there. The
 * integrated workspace is where this evidence is actually gated.
 */
const packageAvailable = await read("function_app.py").then((source) => source !== null);

describe("desktop checkout resolution", () => {
  // Outside the skipped block on purpose: this is the semantics the portal-only CI run
  // depends on, so it must be checked in exactly the run that skips everything else.
  it("resolves one documented value to one directory", () => {
    // `../Quantify Terminal` previously meant two different directories depending on which
    // file interpreted it.
    expect(resolveDesktopRoot({ QT_DESKTOP_PROJECT_PATH: "../Quantify Terminal" }, "/a/b")).toBe(
      "/a/Quantify Terminal",
    );
    expect(resolveDesktopRoot({}, "/a/b")).toBe("/a/Quantify Terminal");
    expect(resolveDesktopRoot({ QT_DESKTOP_PROJECT_PATH: "/abs/desktop" }, "/a/b")).toBe(
      "/abs/desktop",
    );
    expect(resolveDesktopRoot({ QT_DESKTOP_PROJECT_PATH: "   " }, "/a/b")).toBe(
      "/a/Quantify Terminal",
    );
  });
});

describe.skipIf(!packageAvailable)("account API structural evidence", () => {
  it("accepts the checked-in package and reports every property", async () => {
    const sources = await realSources();
    const evidence = analyzeAccountApi(sources);

    expect(evidence).not.toBeNull();
    const missing = Object.entries(evidence ?? {})
      .filter(([, present]) => !present)
      .map(([property]) => property);
    expect(missing).toStrictEqual([]);
  });

  it("reports unavailable evidence when any module is absent", async () => {
    const sources = await realSources();

    for (const name of ACCOUNT_API_MODULES) {
      const withoutModule = {
        ...sources,
        modules: { ...sources.modules, [name]: null },
      };
      expect(analyzeAccountApi(withoutModule)).toBeNull();
    }
    expect(analyzeAccountApi({ ...sources, functionApp: null })).toBeNull();
    expect(analyzeAccountApi({ ...sources, hostJson: null })).toBeNull();
  });

  it("rejects an adapter that decides authorization itself", async () => {
    const sources = await realSources();
    const evidence = analyzeAccountApi({
      ...sources,
      functionApp: `${sources.functionApp}\nrole = resolve_role(user_id, None, None, frozenset())\n`,
    });

    // The adapter must convert transport and delegate. A rule written there is a rule
    // the package's offline tests cannot reach.
    expect(evidence?.modularPackage).toBe(false);
  });

  it("rejects a pure module that imports the Azure SDK", async () => {
    const sources = await realSources();
    const evidence = analyzeAccountApi({
      ...sources,
      modules: {
        ...sources.modules,
        app: `import azure.functions as func\n${sources.modules.app}`,
      },
    });

    expect(evidence?.modularPackage).toBe(false);
  });

  it.each([
    ["a missing route prefix", { hostJson: JSON.stringify({ version: "2.0" }) }],
    [
      "an unversioned prefix",
      { hostJson: JSON.stringify({ extensions: { http: { routePrefix: "api" } } }) },
    ],
    ["malformed host configuration", { hostJson: "{not json" }],
  ])("rejects %s", async (_label, override) => {
    const sources = await realSources();
    const evidence = analyzeAccountApi({ ...sources, ...override });

    // The portal's configured base URL ends in /api/v1; a different prefix silently
    // 404s every call.
    expect(evidence?.versionedRoutePrefix).toBe(false);
  });

  it("rejects a wildcard CORS branch in the package or in the platform config", async () => {
    const sources = await realSources();

    const wildcardInCode = analyzeAccountApi({
      ...sources,
      modules: {
        ...sources.modules,
        http:
          sources.modules.http?.replace(
            'return {\n        "Access-Control-Allow-Origin": origin,',
            'return {\n        "Access-Control-Allow-Origin": "*",',
          ) ?? null,
      },
    });
    expect(wildcardInCode?.exactOriginCors).toBe(false);

    const wildcardInPlatform = analyzeAccountApi({
      ...sources,
      infrastructure:
        sources.infrastructure?.replace("allowedOrigins: []", "allowedOrigins: ['*']") ?? null,
    });
    expect(wildcardInPlatform?.exactOriginCors).toBe(false);
  });

  it("rejects a role matrix that drops the canonical Owner role", async () => {
    const sources = await realSources();
    const evidence = analyzeAccountApi({
      ...sources,
      modules: {
        ...sources.modules,
        capabilities:
          sources.modules.capabilities?.replace('OWNER = "owner"', 'OWNER = "admin"') ?? null,
      },
    });

    // This is the exact defect the legacy update function still carries: an
    // administrative check that cannot see Owner.
    expect(evidence?.canonicalRoleMatrix).toBe(false);
  });

  it("rejects a mutating route with no idempotency handling", async () => {
    const sources = await realSources();
    const evidence = analyzeAccountApi({
      ...sources,
      modules: {
        ...sources.modules,
        app: sources.modules.app?.replace("require_key(request)", "None") ?? null,
      },
    });

    expect(evidence?.idempotentMutations).toBe(false);
  });

  it("rejects an idempotency record written after the mutation", async () => {
    const sources = await realSources();
    const app = sources.modules.app ?? "";
    // Swap the reservation and the completion so the record follows the side effect: the
    // exact shape that lets a killed-and-retried request duplicate an append-only row.
    const reordered = app
      .replace("replay_or_reserve(", "__reserve_later(")
      .replace("complete(deps.idempotency", "replay_or_reserve(deps.idempotency");
    const evidence = analyzeAccountApi({
      ...sources,
      modules: { ...sources.modules, app: reordered },
    });

    expect(evidence?.idempotentMutations).toBe(false);
  });

  it("rejects an adapter that reads the raw correlation header", async () => {
    const sources = await realSources();
    const evidence = analyzeAccountApi({
      ...sources,
      functionApp:
        sources.functionApp?.replace(
          "correlation_id(request)",
          'request.header("x-correlation-id")',
        ) ?? null,
    });

    expect(evidence?.correlatedAudit).toBe(false);
  });

  it("rejects a reconciliation that ignores the legacy bootstrap admins", async () => {
    const sources = await realSources();
    const evidence = analyzeAccountApi({
      ...sources,
      modules: {
        ...sources.modules,
        roles:
          sources.modules.roles?.replaceAll("def legacy_registry", "def unused_registry") ?? null,
      },
    });

    // The legacy function re-applies QT_ADMIN_USER_IDS as admin, so those administrators
    // exist in no blob document and would fall into no mismatch class.
    expect(evidence?.dualReadRolesWithoutCutover).toBe(false);
  });

  it("rejects a readiness flag that ignores an empty legacy blob", async () => {
    const sources = await realSources();
    const evidence = analyzeAccountApi({
      ...sources,
      modules: {
        ...sources.modules,
        roles: sources.modules.roles?.replace("self.legacy_blob_entry_count > 0", "True") ?? null,
      },
    });

    expect(evidence?.dualReadRolesWithoutCutover).toBe(false);
  });

  it("rejects readiness derived from the merged registry instead of the blob", async () => {
    const sources = await realSources();
    const evidence = analyzeAccountApi({
      ...sources,
      modules: {
        ...sources.modules,
        roles:
          sources.modules.roles?.replaceAll("legacy_blob_readable", "legacy_entry_count") ?? null,
      },
    });

    // The bootstrap admins folded into the merged registry must not be able to make an
    // unread blob look like a read one; the blob is the store a cutover retires.
    expect(evidence?.dualReadRolesWithoutCutover).toBe(false);
  });

  it("classifies every property as fully or construct-only pinned", async () => {
    const sources = await realSources();
    const evidence = analyzeAccountApi(sources);
    const classified = new Set([...FULLY_PINNED_PROPERTIES, ...CONSTRUCT_ONLY_PROPERTIES]);

    // A reader takes an unclassified boolean for a fully pinned one.
    expect(Object.keys(evidence ?? {}).sort()).toStrictEqual([...classified].sort());
  });

  it("rejects authentication left to per-handler convention", async () => {
    const sources = await realSources();
    const evidence = analyzeAccountApi({
      ...sources,
      modules: {
        ...sources.modules,
        app:
          sources.modules.app?.replaceAll("if not entry.requires_authentication", "if False") ??
          null,
      },
    });

    // A hand-maintained anonymous list is a claim; the dispatch table is enforcement.
    expect(evidence?.unauthenticatedHealthRoute).toBe(false);
    expect(evidence?.bearerAndActiveChecks).toBe(false);
  });

  it("rejects a reconciliation that could certify a cutover it never evidenced", async () => {
    const sources = await realSources();
    const evidence = analyzeAccountApi({
      ...sources,
      modules: {
        ...sources.modules,
        roles:
          sources.modules.roles?.replace("return self.legacy_blob_readable", "return True") ?? null,
      },
    });

    // An empty difference list means "the sources agree" only if both were read.
    expect(evidence?.dualReadRolesWithoutCutover).toBe(false);
  });

  it("rejects a gateway that writes the legacy role registry", async () => {
    const sources = await realSources();
    const evidence = analyzeAccountApi({
      ...sources,
      modules: {
        ...sources.modules,
        gateways: `${sources.modules.gateways}\n    def _set_server_role(self):\n        pass\n`,
      },
    });

    // Dual-read means read. A cutover is a separate, evidenced task.
    expect(evidence?.dualReadRolesWithoutCutover).toBe(false);
  });

  it.each([
    ["an unpinned requirement", "azure-functions>=1.20.0\n"],
    ["an empty requirements file", "# only a comment\n"],
    ["a missing requirements file", null],
  ])("rejects %s", async (_label, requirements) => {
    const sources = await realSources();
    const evidence = analyzeAccountApi({ ...sources, requirements });

    expect(evidence?.pinnedRequirements).toBe(false);
  });

  it.each([
    ["plaintext traffic", "httpsOnly: true", "httpsOnly: false"],
    ["public blob access", "allowBlobPublicAccess: false", "allowBlobPublicAccess: true"],
    ["a downgraded TLS floor", "minTlsVersion: '1.2'", "minTlsVersion: '1.0'"],
    ["FTP deployment", "ftpsState: 'Disabled'", "ftpsState: 'AllAllowed'"],
    [
      "scale-out past the process-local idempotency store",
      "functionAppScaleLimit: 1",
      "functionAppScaleLimit: 4",
    ],
  ])("rejects staging infrastructure that permits %s", async (_label, from, to) => {
    const sources = await realSources();
    const evidence = analyzeAccountApi({
      ...sources,
      infrastructure: sources.infrastructure?.replaceAll(from, to) ?? null,
    });

    expect(evidence?.safeStagingInfrastructure).toBe(false);
  });

  it.each([
    ["names the parameter", "output leaked string = supabaseServiceRoleKey"],
    [
      "emits the settings collection",
      "output leaked array = functionApp.properties.siteConfig.appSettings",
    ],
    ["emits storage keys", "output leaked object = storage.listKeys()"],
  ])("rejects staging infrastructure whose output %s", async (_label, line) => {
    const sources = await realSources();
    const evidence = analyzeAccountApi({
      ...sources,
      infrastructure: `${sources.infrastructure}\n${line}\n`,
    });

    // A secret readable from a deployment is a secret in a log, whether it is named
    // directly or carried inside a collection.
    expect(evidence?.safeStagingInfrastructure).toBe(false);
  });

  it("rejects a missing infrastructure definition without throwing", async () => {
    const sources = await realSources();
    const evidence = analyzeAccountApi({ ...sources, infrastructure: null });

    expect(evidence?.safeStagingInfrastructure).toBe(false);
    expect(evidence?.exactOriginCors).toBe(false);
  });
});
