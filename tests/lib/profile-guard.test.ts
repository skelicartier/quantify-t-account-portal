import { PROFILE_UNAVAILABLE_MESSAGE } from "@/lib/dal/profile-query";

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

import { requireCurrentProfile } from "@/lib/dal/account";

type ClientOptions = {
  authenticated?: boolean;
  queryError?: unknown;
  factoryThrows?: boolean;
};

function installClient(options: ClientOptions = {}) {
  if (options.factoryThrows) {
    mocks.createServerSupabaseClient.mockRejectedValue(
      new Error("SUPABASE_URL is not configured for this deployment"),
    );
    return;
  }

  const authenticated = options.authenticated ?? true;
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
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
    },
    error: options.queryError ?? null,
  });
  mocks.createServerSupabaseClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authenticated ? { id: USER_ID, email: "user@example.com" } : null },
        error: authenticated ? null : { code: "bad_jwt" },
      }),
    },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })),
  });
}

describe("requireCurrentProfile guard", () => {
  beforeEach(() => vi.clearAllMocks());

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
      return text === PROFILE_UNAVAILABLE_MESSAGE && !text.includes("SUPABASE_URL");
    });
  });
});
