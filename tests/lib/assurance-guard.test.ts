const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";

const mocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { requireCurrentAccount, requireCurrentProfile } from "@/lib/dal/account";
import { MFA_CHALLENGE_NOTICE, requireMutationAssurance } from "@/lib/dal/assurance-guard";

type ClientOptions = {
  authenticated?: boolean;
  factors?: Array<Record<string, unknown>>;
  currentLevel?: string | null;
  nextLevel?: string | null;
  factorsThrow?: boolean;
  levelError?: unknown;
};

const verifiedFactor = { id: "factor-verified", factor_type: "totp", status: "verified" };

function installClient(options: ClientOptions = {}) {
  const authenticated = options.authenticated ?? true;
  const overviewRow = {
    user_id: USER_ID,
    first_name: "Avery",
    last_name: "Stone",
    is_active: true,
    subscription_tier: "free",
    created_at: "2024-01-03T03:04:05.000Z",
    last_login_at: null,
  };
  const profileRow = {
    user_id: USER_ID,
    first_name: "Avery",
    last_name: "Stone",
    phone: "",
    country: "United States",
    timezone: "UTC",
    default_currency: "USD",
    notify_price_alerts: true,
    notify_portfolio_moves: true,
    notify_news_digest: false,
    profile_version: 3,
    updated_at: "2026-09-02T08:00:00.000Z",
  };
  const maybeSingle = vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({
    data: { ...overviewRow, ...profileRow },
    error: null,
  }));
  const listFactors = vi.fn(async () => {
    if (options.factorsThrow) throw new Error("transport failed");
    return { data: { all: options.factors ?? [] }, error: null };
  });
  const levelError = options.levelError ?? null;

  mocks.createServerSupabaseClient.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: authenticated
            ? {
                id: USER_ID,
                email: "user@example.com",
                created_at: "2024-01-02T03:04:05.000Z",
                last_sign_in_at: null,
                email_confirmed_at: "2024-01-02T03:05:00.000Z",
              }
            : null,
        },
        error: authenticated ? null : { message: "invalid session" },
      })),
      mfa: {
        listFactors,
        getAuthenticatorAssuranceLevel: vi.fn(async () => ({
          data: {
            currentLevel: options.currentLevel ?? "aal1",
            nextLevel: options.nextLevel ?? "aal1",
          },
          error: levelError,
        })),
      },
    },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("assurance enforcement on protected routes", () => {
  it.each([
    ["requireCurrentAccount", requireCurrentAccount],
    ["requireCurrentProfile", requireCurrentProfile],
  ])("%s refuses an AAL1 session while a verified factor exists", async (_label, guard) => {
    installClient({ factors: [verifiedFactor], currentLevel: "aal1", nextLevel: "aal2" });

    await expect(guard()).rejects.toThrowError(`NEXT_REDIRECT:${MFA_CHALLENGE_NOTICE}`);
    expect(mocks.redirect).toHaveBeenCalledWith(MFA_CHALLENGE_NOTICE);
  });

  it.each([
    ["requireCurrentAccount", requireCurrentAccount],
    ["requireCurrentProfile", requireCurrentProfile],
  ])("%s serves a session that already satisfied the factor", async (_label, guard) => {
    installClient({ factors: [verifiedFactor], currentLevel: "aal2", nextLevel: "aal2" });

    await expect(guard()).resolves.toMatchObject({ userId: USER_ID });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("serves an account with no enrolled factor", async () => {
    installClient({ currentLevel: "aal1", nextLevel: "aal1" });

    await expect(requireCurrentAccount()).resolves.toMatchObject({ userId: USER_ID });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("does not lock the owner out when factor lookup fails", async () => {
    installClient({ factorsThrow: true });

    await expect(requireCurrentAccount()).resolves.toMatchObject({ userId: USER_ID });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("still redirects an unauthenticated visitor to plain login", async () => {
    installClient({ authenticated: false });

    await expect(requireCurrentAccount()).rejects.toThrowError("NEXT_REDIRECT:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("refuses a session whose cookie hides the factor list but whose factors are real", async () => {
    // The provider helper reads the request cookie on the server, so its own nextLevel
    // can be stripped by the caller. Enforcement follows the attested factor list.
    installClient({ factors: [verifiedFactor], currentLevel: "aal1", nextLevel: "aal1" });

    await expect(requireCurrentAccount()).rejects.toThrowError(
      `NEXT_REDIRECT:${MFA_CHALLENGE_NOTICE}`,
    );
  });
});

describe("assurance enforcement on mutations", () => {
  it("refuses without redirecting when a factor is still owed", async () => {
    installClient({ factors: [verifiedFactor], currentLevel: "aal1", nextLevel: "aal2" });

    const { decision } = await requireMutationAssurance();

    // A redirect thrown inside a form action would be indistinguishable from success
    // to the form that called it, so the guard hands back a value instead.
    expect(decision).toBe("challenge-required");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("permits a satisfied session and returns the resolved state", async () => {
    installClient({ factors: [verifiedFactor], currentLevel: "aal2", nextLevel: "aal2" });

    const { decision, assurance } = await requireMutationAssurance();

    expect(decision).toBe("satisfied");
    expect(assurance.verifiedTotpFactors).toHaveLength(1);
  });

  it("refuses every mutation on an unreadable inventory while rendering still proceeds", async () => {
    installClient({ factorsThrow: true, currentLevel: "aal1", nextLevel: "aal1" });

    await expect(requireMutationAssurance()).resolves.toMatchObject({ decision: "unavailable" });
    // Rendering deliberately survives the same outage: a transport blip must not lock
    // an owner out of their own account.
    await expect(requireCurrentAccount()).resolves.toMatchObject({ userId: USER_ID });
  });

  it("refuses everything when the assurance level is unreadable", async () => {
    installClient({ levelError: { message: "session unreadable" } });

    await expect(requireMutationAssurance()).resolves.toMatchObject({ decision: "unavailable" });
  });

  it("refuses when the client cannot be created at all", async () => {
    mocks.createServerSupabaseClient.mockRejectedValue(new Error("configuration missing"));

    const { decision } = await requireMutationAssurance();

    expect(decision).toBe("unavailable");
  });
});
