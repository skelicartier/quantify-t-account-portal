const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";

const mocks = vi.hoisted(() => {
  class AccountApiRequestError extends Error {
    readonly status: number;
    readonly code: string;
    readonly details: Record<string, unknown> = {};
    constructor(status: number, code: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  }
  return {
    AccountApiRequestError,
    cookieValues: new Map<string, string>(),
    refreshSession: vi.fn(),
    fetchAccountApiPasskeys: vi.fn(),
    createServerAzureClient: vi.fn(),
    fetchAccountApiProfile: vi.fn(),
    heartbeatCurrentAccountApiSession: vi.fn(),
    redirect: vi.fn((destination: string) => {
      throw new Error(`NEXT_REDIRECT:${destination}`);
    }),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
}));
vi.mock("@/lib/admin/account-api", () => ({
  AccountApiRequestError: mocks.AccountApiRequestError,
  fetchAccountApiProfile: mocks.fetchAccountApiProfile,
  fetchAccountApiPasskeys: mocks.fetchAccountApiPasskeys,
}));
vi.mock("@/lib/account/session-lifecycle", () => ({
  heartbeatCurrentAccountApiSession: mocks.heartbeatCurrentAccountApiSession,
}));
vi.mock("@/lib/azure-auth-client", () => ({
  AzureAuthClient: class {
    refreshSession = mocks.refreshSession;
  },
}));
vi.mock("@/lib/azure-auth-config", () => ({
  getAzureAuthConfig: () => ({
    apiUrl: "https://account.example.test/api/v1",
    cookieName: "qt-access",
    refreshTokenName: "qt-refresh",
    cookieOptions: {},
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      mocks.cookieValues.has(name) ? { name, value: mocks.cookieValues.get(name) } : undefined,
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
// `cache` memoises per request in the server runtime; under test every call is its own request.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

import { requireCurrentAccount, requireCurrentProfile } from "@/lib/dal/account";
import {
  getCurrentAssurance,
  getCurrentPasskeys,
  requireMutationAssurance,
} from "@/lib/dal/assurance-guard";

function profileRow() {
  return {
    user_id: USER_ID,
    first_name: "Avery",
    last_name: "Stone",
    phone: "",
    country: "United States",
    email: "user@example.com",
    is_admin: false,
    is_active: true,
    subscription_tier: "free",
    two_factor_enabled: false,
    timezone: "UTC",
    default_currency: "USD",
    notify_price_alerts: true,
    notify_portfolio_moves: true,
    notify_news_digest: false,
    profile_version: 3,
    created_at: "2024-01-03T03:04:05.000Z",
    last_login_at: "",
    data_refresh_rate: "15m",
    theme_preference: "system",
    updated_at: "2026-09-02T08:00:00.000Z",
  };
}

type Assurance = {
  mode: "off" | "when-enrolled" | "required";
  staff: boolean;
  enrolled: boolean;
  passkeys: number;
  required: boolean;
  verified: boolean;
  fresh: boolean;
  verified_at: string | null;
  verified_until: string | null;
  fresh_until: string | null;
  session_bound: boolean;
};

function passkeysAnswer(overrides: Partial<Assurance> = {}, passkeys: unknown[] = []) {
  return {
    ok: true as const,
    correlation_id: "corr-1",
    passkeys,
    assurance: {
      mode: "when-enrolled",
      staff: false,
      enrolled: false,
      passkeys: 0,
      required: false,
      verified: false,
      fresh: false,
      verified_at: null,
      verified_until: null,
      fresh_until: null,
      session_bound: true,
      ...overrides,
    } satisfies Assurance,
    limits: { max_passkeys: 10, session_minutes: 720, fresh_minutes: 15 },
  };
}

function installClient(
  options: { authenticated?: boolean; clientThrows?: boolean; accessToken?: string | null } = {},
) {
  if (options.clientThrows) {
    mocks.createServerAzureClient.mockRejectedValue(new Error("configuration missing"));
    return;
  }
  const user =
    options.authenticated === false
      ? null
      : {
          id: USER_ID,
          email: "user@example.com",
          first_name: "Avery",
          last_name: "Stone",
          is_active: true,
          email_confirmed: true,
          role: "user",
          profile: null,
        };
  const accessToken = options.accessToken === undefined ? "access-token" : options.accessToken;
  const azure = {
    getUser: vi.fn(async () => user),
    getAccessToken: vi.fn(() => accessToken),
  };
  mocks.createServerAzureClient.mockResolvedValue(azure);
  mocks.fetchAccountApiProfile.mockResolvedValue({ profile: profileRow() });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookieValues.clear();
  mocks.heartbeatCurrentAccountApiSession.mockResolvedValue(true);
  mocks.fetchAccountApiPasskeys.mockResolvedValue(passkeysAnswer());
});

describe("assurance enforcement on protected routes", () => {
  it.each([
    ["requireCurrentAccount", requireCurrentAccount],
    ["requireCurrentProfile", requireCurrentProfile],
  ])("%s serves a signed-in account that has no passkey", async (_label, guard) => {
    installClient();

    await expect(guard()).resolves.toMatchObject({ userId: USER_ID });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.heartbeatCurrentAccountApiSession).toHaveBeenCalled();
  });

  it.each([
    ["requireCurrentAccount", requireCurrentAccount],
    ["requireCurrentProfile", requireCurrentProfile],
  ])("%s sends a session that owes its passkey to the passkey page", async (_label, guard) => {
    installClient();
    mocks.fetchAccountApiPasskeys.mockResolvedValue(
      passkeysAnswer({ enrolled: true, passkeys: 1, verified: false }),
    );

    await expect(guard()).rejects.toThrowError("NEXT_REDIRECT:/passkey");
    expect(mocks.heartbeatCurrentAccountApiSession).not.toHaveBeenCalled();
  });

  it("serves the account again once the session has proved the passkey", async () => {
    installClient();
    mocks.fetchAccountApiPasskeys.mockResolvedValue(
      passkeysAnswer({ enrolled: true, passkeys: 1, verified: true, fresh: true }),
    );

    await expect(requireCurrentAccount()).resolves.toMatchObject({ userId: USER_ID });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects an unauthenticated visitor to plain login", async () => {
    installClient({ authenticated: false });

    await expect(requireCurrentAccount()).rejects.toThrowError("NEXT_REDIRECT:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("reports unavailable when the Azure client cannot be created", async () => {
    installClient({ clientThrows: true });

    await expect(requireCurrentAccount()).rejects.toThrowError(
      "Account data is temporarily unavailable.",
    );
  });
});

describe("what the service's answer means", () => {
  it("reads a staff account with a proved passkey as the second level, reached", async () => {
    installClient();
    mocks.fetchAccountApiPasskeys.mockResolvedValue(
      passkeysAnswer({
        staff: true,
        enrolled: true,
        passkeys: 2,
        required: true,
        verified: true,
        fresh: false,
        verified_until: "2026-11-21T21:00:00Z",
      }),
    );

    const assurance = await getCurrentAssurance();

    expect(assurance).toMatchObject({
      currentLevel: "aal2",
      requiredLevel: "aal2",
      mfaEnrolled: true,
      challengeRequired: false,
      levelReadable: true,
      factorsReadable: true,
    });
    expect(assurance.passkey).toEqual({
      mode: "when-enrolled",
      staff: true,
      enrolled: true,
      count: 2,
      required: true,
      verified: true,
      fresh: false,
      verifiedUntil: "2026-11-21T21:00:00Z",
      freshUntil: null,
    });
  });

  it("requires the second level of a staff account that must add its first passkey, without shutting it out of its own pages", async () => {
    installClient();
    mocks.fetchAccountApiPasskeys.mockResolvedValue(
      passkeysAnswer({ mode: "required", staff: true, required: true }),
    );

    const assurance = await getCurrentAssurance();

    expect(assurance).toMatchObject({
      currentLevel: "aal1",
      requiredLevel: "aal2",
      challengeRequired: false,
    });
    await expect(requireCurrentAccount()).resolves.toMatchObject({ userId: USER_ID });
  });

  it.each([
    ["a service from before passkeys", 404, "not_found"],
    ["an account whose application is undecided", 403, "access_pending"],
    ["an account that was declined", 403, "access_declined"],
  ])("treats %s as signed in with nothing owed", async (_label, status, code) => {
    installClient();
    mocks.fetchAccountApiPasskeys.mockRejectedValue(new mocks.AccountApiRequestError(status, code));

    await expect(getCurrentAssurance()).resolves.toMatchObject({
      currentLevel: "aal1",
      requiredLevel: "aal1",
      challengeRequired: false,
      factorsReadable: true,
    });
  });

  it.each([
    ["an outage", new Error("socket hang up")],
    ["a refusal it does not recognise", new mocks.AccountApiRequestError(403, "forbidden")],
    ["a server fault", new mocks.AccountApiRequestError(503, "upstream_unavailable")],
  ])("never reads %s as nothing owed", async (_label, failure) => {
    installClient();
    mocks.fetchAccountApiPasskeys.mockRejectedValue(failure);

    const { decision, assurance } = await requireMutationAssurance();

    expect(decision).toBe("unavailable");
    expect(assurance).toMatchObject({ levelReadable: false, factorsReadable: false });
    expect(assurance.passkey).toBeUndefined();
  });

  it("asks again with a renewed token when the access token ran out mid-request", async () => {
    installClient();
    mocks.cookieValues.set("qt-refresh", "refresh-token");
    mocks.refreshSession.mockResolvedValue({ access_token: "renewed-token" });
    mocks.fetchAccountApiPasskeys
      .mockRejectedValueOnce(new mocks.AccountApiRequestError(401, "unauthenticated"))
      .mockResolvedValueOnce(passkeysAnswer({ enrolled: true, passkeys: 1 }));

    const assurance = await getCurrentAssurance();

    expect(mocks.refreshSession).toHaveBeenCalledWith("access-token", "refresh-token");
    expect(mocks.fetchAccountApiPasskeys).toHaveBeenLastCalledWith("renewed-token");
    expect(assurance.challengeRequired).toBe(true);
  });

  it("a session with only a refresh cookie still owes its passkey", async () => {
    // The browser drops the access cookie when it expires. Dropping it by hand must not
    // be a way past the passkey either.
    installClient({ accessToken: null });
    mocks.cookieValues.set("qt-refresh", "refresh-token");
    mocks.refreshSession.mockResolvedValue({ access_token: "renewed-token" });
    mocks.fetchAccountApiPasskeys.mockResolvedValue(passkeysAnswer({ enrolled: true, passkeys: 1 }));

    await expect(getCurrentAssurance()).resolves.toMatchObject({ challengeRequired: true });
    expect(mocks.refreshSession).toHaveBeenCalledWith(null, "refresh-token");
    expect(mocks.fetchAccountApiPasskeys).toHaveBeenCalledWith("renewed-token");
  });

  it("reads no token and no refresh token as nobody signed in", async () => {
    installClient({ accessToken: null });

    await expect(getCurrentAssurance()).resolves.toMatchObject({
      levelReadable: false,
      factorsReadable: false,
    });
    expect(mocks.fetchAccountApiPasskeys).not.toHaveBeenCalled();
  });
});

describe("assurance enforcement on mutations", () => {
  it("permits a signed-in session on an account with no passkey", async () => {
    installClient();

    const { decision, assurance } = await requireMutationAssurance();

    expect(decision).toBe("satisfied");
    expect(assurance).toMatchObject({
      currentLevel: "aal1",
      requiredLevel: "aal1",
      factorsReadable: true,
      mfaEnrolled: false,
    });
  });

  it("refuses a mutation from a session that owes its passkey", async () => {
    installClient();
    mocks.fetchAccountApiPasskeys.mockResolvedValue(passkeysAnswer({ enrolled: true, passkeys: 1 }));

    await expect(requireMutationAssurance()).resolves.toMatchObject({
      decision: "challenge-required",
    });
  });

  it("refuses mutations when the token is not a session", async () => {
    installClient();
    mocks.fetchAccountApiPasskeys.mockRejectedValue(
      new mocks.AccountApiRequestError(401, "unauthenticated"),
    );

    await expect(requireMutationAssurance()).resolves.toMatchObject({ decision: "unavailable" });
  });
});

describe("the Security page's list", () => {
  it("lists the account's passkeys by name and date with the session's state", async () => {
    installClient();
    mocks.fetchAccountApiPasskeys.mockResolvedValue(
      passkeysAnswer({ enrolled: true, passkeys: 1, verified: true, fresh: true }, [
        {
          id: "0b6f8a52-1111-4222-8333-444455556666",
          name: "MacBook Touch ID",
          created_at: "2026-11-21T09:00:00Z",
          last_used_at: null,
        },
      ]),
    );

    await expect(getCurrentPasskeys()).resolves.toEqual({
      passkeys: [
        {
          id: "0b6f8a52-1111-4222-8333-444455556666",
          name: "MacBook Touch ID",
          createdAt: "2026-11-21T09:00:00Z",
          lastUsedAt: null,
        },
      ],
      state: expect.objectContaining({ enrolled: true, verified: true, fresh: true, count: 1 }),
      maxPasskeys: 10,
    });
  });

  it("offers nothing when the service could not say", async () => {
    installClient();
    mocks.fetchAccountApiPasskeys.mockRejectedValue(new Error("socket hang up"));

    await expect(getCurrentPasskeys()).resolves.toBeNull();
  });
});
