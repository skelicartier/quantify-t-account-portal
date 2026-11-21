import { PROFILE_UNAVAILABLE_MESSAGE } from "@/lib/dal/profile-query";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";

const mocks = vi.hoisted(() => ({
  createServerAzureClient: vi.fn(),
  fetchAccountApiProfile: vi.fn(),
  requireSatisfiedAssurance: vi.fn(),
  heartbeatCurrentAccountApiSession: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerAzureClient: mocks.createServerAzureClient,
}));
vi.mock("@/lib/admin/account-api", () => ({
  fetchAccountApiProfile: mocks.fetchAccountApiProfile,
}));
vi.mock("@/lib/dal/assurance-guard", () => ({
  requireSatisfiedAssurance: mocks.requireSatisfiedAssurance,
  // Started alongside the account read; the guard above is what is awaited.
  getCurrentAssurance: vi.fn(async () => ({})),
}));
vi.mock("@/lib/account/session-lifecycle", () => ({
  heartbeatCurrentAccountApiSession: mocks.heartbeatCurrentAccountApiSession,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { requireCurrentProfile } from "@/lib/dal/account";

type ClientOptions = {
  authenticated?: boolean;
  queryError?: unknown;
  factoryThrows?: boolean;
};

function installClient(options: ClientOptions = {}) {
  if (options.factoryThrows) {
    mocks.createServerAzureClient.mockRejectedValue(
      new Error("QT_ACCOUNT_API_URL is not configured for this deployment"),
    );
    return;
  }

  const authenticated = options.authenticated ?? true;
  mocks.fetchAccountApiProfile.mockImplementation(async () => {
    if (options.queryError) throw new Error("provider unavailable");
    return {
      profile: {
        user_id: USER_ID,
        first_name: "Avery",
        last_name: "Stone",
        email: "user@example.com",
        phone: "",
        country: "United States",
        is_admin: false,
        is_active: true,
        timezone: "UTC",
        default_currency: "USD",
        subscription_tier: "free",
        two_factor_enabled: false,
        notify_price_alerts: true,
        notify_portfolio_moves: true,
        notify_news_digest: false,
        data_refresh_rate: "15m",
        theme_preference: "system",
        profile_version: 3,
        created_at: "2024-01-03T03:04:05.000Z",
        last_login_at: "",
        updated_at: "2026-09-02T08:00:00.000Z",
      },
    };
  });
  mocks.createServerAzureClient.mockResolvedValue({
    getUser: vi
      .fn()
      .mockResolvedValue(authenticated ? { id: USER_ID, email: "user@example.com" } : null),
    getAccessToken: vi.fn(() => "server-token"),
  });
}

describe("requireCurrentProfile guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSatisfiedAssurance.mockResolvedValue(undefined);
    mocks.heartbeatCurrentAccountApiSession.mockResolvedValue(true);
  });

  it("returns the profile for a verified owner without redirecting", async () => {
    installClient();

    await expect(requireCurrentProfile()).resolves.toMatchObject({
      userId: USER_ID,
      profileVersion: 3,
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects to login only when Auth reports no verified user", async () => {
    installClient({ authenticated: false });

    await expect(requireCurrentProfile()).rejects.toThrowError("NEXT_REDIRECT:/login");
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/login");
  });

  it.each([
    ["a provider query failure", { queryError: { code: "57014" } } satisfies ClientOptions],
    ["a failed server client factory", { factoryThrows: true } satisfies ClientOptions],
  ])("raises a generic server error for %s instead of redirecting", async (_label, options) => {
    installClient(options);

    await expect(requireCurrentProfile()).rejects.toThrowError(PROFILE_UNAVAILABLE_MESSAGE);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("never leaks configuration detail from a failed client factory", async () => {
    installClient({ factoryThrows: true });

    await expect(requireCurrentProfile()).rejects.toSatisfy((error: unknown) => {
      const text = error instanceof Error ? error.message : String(error);
      return text === PROFILE_UNAVAILABLE_MESSAGE && !text.includes("QT_ACCOUNT_API_URL");
    });
  });
});
