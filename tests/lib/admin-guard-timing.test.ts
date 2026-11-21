/**
 * Administration pages asked who this is, waited, told the service the session was alive,
 * waited, and only then asked what the session owes. The last question now travels with
 * the first, and the heartbeat is sent once the page has gone out.
 */
import type { AssuranceState } from "@/lib/auth/assurance";

const assurance: AssuranceState = {
  verifiedTotpFactors: [],
  unverifiedTotpFactorIds: [],
  currentLevel: "aal1",
  requiredLevel: "aal1",
  mfaEnrolled: false,
  challengeRequired: false,
  levelReadable: true,
  factorsReadable: true,
};

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const flush = () => new Promise((done) => setTimeout(done, 0));

async function load(options: { heartbeat?: () => Promise<boolean>; after?: (work: () => Promise<void>) => void }) {
  vi.resetModules();
  const me = deferred<unknown>();
  const fetchAccountApiMe = vi.fn(() => me.promise);
  const getCurrentAssurance = vi.fn(async () => assurance);
  const heartbeatAccountApiSession = vi.fn(options.heartbeat ?? (async () => true));
  const after = vi.fn(
    options.after ??
      (() => {
        throw new Error("`after` was called outside a request scope");
      }),
  );
  vi.doMock("next/server", () => ({ after }));
  vi.doMock("@/lib/supabase/server", () => ({
    createServerAzureClient: async () => ({ getAccessToken: () => "bearer-token" }),
  }));
  vi.doMock("@/lib/dal/assurance-guard", () => ({ getCurrentAssurance }));
  vi.doMock("@/lib/account/session-lifecycle", () => ({ heartbeatAccountApiSession }));
  vi.doMock("next/navigation", () => ({
    redirect: (destination: string) => {
      throw new Error(`NEXT_REDIRECT:${destination}`);
    },
  }));
  vi.doMock("@/lib/admin/account-api", async () => {
    const actual =
      await vi.importActual<typeof import("@/lib/admin/account-api")>("@/lib/admin/account-api");
    return { ...actual, fetchAccountApiMe };
  });
  const access = await import("@/lib/admin/access");
  return { access, me, fetchAccountApiMe, getCurrentAssurance, heartbeatAccountApiSession, after };
}

const ORDINARY_ACCOUNT = {
  ok: true,
  correlation_id: "corr-1",
  environment: "production",
  user: {
    user_id: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
    email: "member@example.test",
    is_active: true,
  },
  role: { effective: "user", source: "registry", registry: "user", legacy: null, break_glass: false },
  capabilities: ["account:read-self"],
};

afterEach(() => {
  vi.resetModules();
  for (const name of [
    "next/server",
    "@/lib/supabase/server",
    "@/lib/dal/assurance-guard",
    "@/lib/account/session-lifecycle",
    "next/navigation",
    "@/lib/admin/account-api",
  ]) {
    vi.doUnmock(name);
  }
});

describe("what an administration page waits for", () => {
  it("asks what the session owes while it is still learning who this is", async () => {
    const { access, me, fetchAccountApiMe, getCurrentAssurance } = await load({});

    const page = access.getAdminDashboardAccess().catch((error: unknown) => error);
    await flush();

    expect(fetchAccountApiMe).toHaveBeenCalledTimes(1);
    // `me` has not answered, and the second question is already on its way.
    expect(getCurrentAssurance).toHaveBeenCalledTimes(1);

    me.resolve(ORDINARY_ACCOUNT);
    await page;
  });

  it("does not wait for the heartbeat, and still sends it with this session's token", async () => {
    const { access, me, heartbeatAccountApiSession } = await load({
      heartbeat: () => new Promise<boolean>(() => {}),
    });

    const page = access.getAdminDashboardAccess().catch((error: unknown) => error);
    me.resolve(ORDINARY_ACCOUNT);
    const settled = await Promise.race([page.then(() => "settled"), flush().then(flush).then(() => "waiting")]);

    expect(settled).toBe("settled");
    expect(heartbeatAccountApiSession).toHaveBeenCalledWith("bearer-token");
  });

  it("sends the heartbeat only after the page has gone out, when there is a response", async () => {
    const scheduled: Array<() => Promise<void>> = [];
    const { access, me, heartbeatAccountApiSession } = await load({
      after: (work) => {
        scheduled.push(work);
      },
    });

    const page = access.getAdminDashboardAccess().catch((error: unknown) => error);
    me.resolve(ORDINARY_ACCOUNT);
    await page;

    expect(heartbeatAccountApiSession).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    await scheduled[0]!();
    expect(heartbeatAccountApiSession).toHaveBeenCalledTimes(1);
  });
});
