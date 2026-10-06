import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ACCESS_DECLINED_MESSAGE, ACCESS_PENDING_MESSAGE } from "@/lib/account/access";
import { DELETION_BROKER_HOLD_CODE } from "@/lib/account/lifecycle-input";
import {
  accountApiAccountLifecycleSchema,
  RESUME_REFUSED_BROKER_TEST,
  RESUME_REFUSED_KILL_SWITCH,
} from "@/lib/admin/account-api";
import { resolveDesktopRoot } from "@/lib/preflight/desktop-root";

/**
 * The sentences the console shows for a held account, and the erasure statement the mock
 * returns, are the service's own words. They are held here as copies — the console shows them
 * by code, never by echoing a refusal — so this test is what keeps a copy from drifting when
 * the service rewords one. Skipped, like the route-parity cases, in a checkout without the
 * sibling desktop repository.
 */

const PACKAGE_ROOT = resolve(resolveDesktopRoot(), "cloud/azure/account_function/account_api");

const available = await readFile(resolve(PACKAGE_ROOT, "errors.py"), "utf8").then(
  () => true,
  () => false,
);

/** Python's implicit concatenation of adjacent string literals, joined. */
function joinLiterals(text: string): string {
  return [...text.matchAll(/"((?:[^"\\]|\\.)*)"/gu)].map((match) => match[1]!).join("");
}

/** The message `errors.py` maps one code constant to. */
function pythonMessage(source: string, constant: string): string {
  const match = source.match(new RegExp(`\\n\\s*${constant}: \\(([^)]*)\\),`, "u"));
  return match ? joinLiterals(match[1]!) : "";
}

/** The items of a Python list of (possibly concatenated) string literals. */
function pythonStringList(text: string): string[] {
  const items: string[] = [];
  let current = "";
  for (const match of text.matchAll(/"((?:[^"\\]|\\.)*)"|,/gu)) {
    if (match[0] === ",") {
      if (current) items.push(current);
      current = "";
    } else {
      current += match[1];
    }
  }
  if (current) items.push(current);
  return items;
}

describe.skipIf(!available)("the service's own words", () => {
  it("shows the access sentences exactly as the service writes them", async () => {
    const errors = await readFile(resolve(PACKAGE_ROOT, "errors.py"), "utf8");

    expect(pythonMessage(errors, "ACCESS_PENDING")).toBe(ACCESS_PENDING_MESSAGE);
    expect(pythonMessage(errors, "ACCESS_DECLINED")).toBe(ACCESS_DECLINED_MESSAGE);
  });

  it("has the mock refuse a held account with the same sentences", async () => {
    const mock = await readFile(resolve("scripts/mock-account-api.ts"), "utf8");

    const sentence = (name: string) =>
      mock.match(new RegExp(`const ${name} =\\s*"([^"]+)";`, "u"))?.[1];
    expect(sentence("ACCESS_PENDING_MESSAGE")).toBe(ACCESS_PENDING_MESSAGE);
    expect(sentence("ACCESS_DECLINED_MESSAGE")).toBe(ACCESS_DECLINED_MESSAGE);
  });

  it("has the mock answer a deletion with the erasure statement the service makes true", async () => {
    const erasure = await readFile(resolve(PACKAGE_ROOT, "erasure.py"), "utf8");
    const mock = await readFile(resolve("scripts/mock-account-api.ts"), "utf8");

    // Matched as runs of string literals, because the prose itself contains "), " and "],".
    const statement = erasure.slice(erasure.indexOf("ERASURE_STATEMENT"));
    const literal = String.raw`"(?:[^"\\]|\\.)*"`;
    const erasedRun = statement.match(
      new RegExp(`"erased":\\s*\\(((?:\\s*${literal})+)\\s*\\)`, "u"),
    );
    const keptRun = statement.match(
      new RegExp(`"kept":\\s*\\[((?:\\s*${literal}\\s*,?)+)\\s*\\]`, "u"),
    );
    const serviceErased = joinLiterals(erasedRun?.[1] ?? "");
    const serviceKept = pythonStringList(keptRun?.[1] ?? "");
    expect(serviceErased.length).toBeGreaterThan(100);
    expect(serviceKept.length).toBeGreaterThan(0);

    // The mock's copy is a TypeScript object literal with `+` concatenation; evaluate it as
    // the expression it is rather than re-implementing its parsing.
    const start = mock.indexOf("const ERASURE_STATEMENT = ");
    const end = mock.indexOf("} as const;", start);
    const source = mock.slice(start + "const ERASURE_STATEMENT = ".length, end + 1);
    const mocked = new Function(`return (${source});`)() as { erased: string; kept: string[] };

    expect(mocked.erased).toBe(serviceErased);
    expect([...mocked.kept]).toEqual(serviceKept);
  });
});

/** One Python module constant's string value. */
function pythonConstant(source: string, name: string): string | undefined {
  return source.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"`, "mu"))?.[1];
}

/** A Python tuple or frozenset of string literals, by its assignment's name. */
function pythonStrings(source: string, name: string): string[] {
  const start = source.indexOf(`${name}:`);
  if (start === -1) return [];
  const end = source.indexOf(")", source.indexOf("(", start) + 1);
  return [...source.slice(start, end).matchAll(/"([^"]+)"/gu)].map((match) => match[1]!);
}

describe.skipIf(!available)("the service's codes the console branches on", () => {
  it("words resume refusals by the service's own codes, and the mock answers with them", async () => {
    const broker = await readFile(resolve(PACKAGE_ROOT, "broker_routes.py"), "utf8");
    const mock = await readFile(resolve("scripts/mock-account-api.ts"), "utf8");

    expect(pythonConstant(broker, "RESUME_REFUSED_BROKER_TEST")).toBe(RESUME_REFUSED_BROKER_TEST);
    expect(pythonConstant(broker, "RESUME_REFUSED_KILL_SWITCH")).toBe(RESUME_REFUSED_KILL_SWITCH);
    expect(mock).toContain(`reason: "${RESUME_REFUSED_BROKER_TEST}"`);
    expect(mock).toContain(`reason: "${RESUME_REFUSED_KILL_SWITCH}"`);
  });

  it("reads the deletion hold by the service's code, and the mock holds with it", async () => {
    const lifecycle = await readFile(resolve(PACKAGE_ROOT, "lifecycle.py"), "utf8");
    const mock = await readFile(resolve("scripts/mock-account-api.ts"), "utf8");

    expect(pythonConstant(lifecycle, "BROKER_HOLD_CODE")).toBe(DELETION_BROKER_HOLD_CODE);
    expect(mock).toContain(`code: "${DELETION_BROKER_HOLD_CODE}"`);
  });

  it("accepts every cleanup status the service can send, and the mock sends every step", async () => {
    const lifecycle = await readFile(resolve(PACKAGE_ROOT, "lifecycle.py"), "utf8");
    const mock = await readFile(resolve("scripts/mock-account-api.ts"), "utf8");
    const statuses = pythonStrings(lifecycle, "ACCOUNT_CLEANUP_STATUSES");
    const steps = pythonStrings(lifecycle, "ACCOUNT_CLEANUP_STEPS");
    expect(statuses).toEqual(expect.arrayContaining(["held", "incomplete"]));
    expect(steps).toEqual(expect.arrayContaining(["brokers", "documents"]));

    // Every status, in a lifecycle the console's strict schema must still read.
    const request = {
      id: "25000000-0000-4000-8000-000000000001",
      status: "blocked",
      requested_at: "",
      scheduled_delete_at: "",
      cancelled_at: "",
      completed_at: "",
      cooling_off_seconds: 1_209_600,
      can_cancel: false,
      legal_hold: false,
      hold_reason: "",
      cleanup: Object.fromEntries(
        steps.map((step, index) => [step, statuses[index % statuses.length]]),
      ),
      attempts: 0,
      max_attempts: 3,
      next_attempt_at: "",
      last_error: "",
      hold: null,
      offline_desktop_cache_note: "not-remotely-deletable",
    };
    for (const status of statuses) {
      const parsed = accountApiAccountLifecycleSchema.safeParse({
        ok: true,
        correlation_id: "qt",
        revision: "rev",
        generated_at: "2026-10-06T00:00:00Z",
        export_queue: { job_limit: 50, returned: 0, per_user_limit: 3 },
        exports: [],
        deletion: { active: null, requests: [{ ...request, cleanup: { brokers: status } }] },
      });
      expect(parsed.success, `cleanup status ${status}`).toBe(true);
    }

    const start = mock.indexOf("function newDeletionRequest");
    const block = mock.slice(mock.indexOf("cleanup: {", start), mock.indexOf("},", start));
    const mocked = [...block.matchAll(/(\w+): "pending"/gu)].map((match) => match[1]!);
    expect(mocked.sort()).toEqual([...steps].sort());
  });

  it("has the mock send the access status in me and the halt's reason in the broker list", async () => {
    const app = await readFile(resolve(PACKAGE_ROOT, "app.py"), "utf8");
    const broker = await readFile(resolve(PACKAGE_ROOT, "broker_routes.py"), "utf8");
    const mock = await readFile(resolve("scripts/mock-account-api.ts"), "utf8");

    expect(app).toContain('payload["user"]["access_status"]');
    expect(mock).toMatch(/user: \{[^}]*access_status: me\.access/u);
    expect(broker).toContain('"halt_reason": reason if halted else None');
    expect(broker).toContain('view["halt_reason"]');
    expect(mock).toContain("halt_reason: halted ? haltReason || null : null");
    expect(mock).toMatch(/halt_reason: view\.trading_halted \? haltReason \|\| null : null/u);
  });
});
