import { ACCOUNT_OVERVIEW_UNAVAILABLE_MESSAGE } from "@/lib/dal/account-query";

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

import { requireCurrentAccount } from "@/lib/dal/account";

type ClientOptions = {
  authenticated?: boolean;
  authThrows?: boolean;
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
      is_active: true,
      subscription_tier: "free",
      created_at: "2024-01-03T03:04:05.000Z",
      last_login_at: null,
    },
    error: null,
  });
  mocks.createServerSupabaseClient.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => {
        if (options.authThrows) throw new Error("auth transport failed");
        return {
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
        };
      }),
    },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })),
  });
}

describe("requireCurrentAccount guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the overview for a verified owner without redirecting", async () => {
    installClient();

    await expect(requireCurrentAccount()).resolves.toMatchObject({ userId: USER_ID });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects to login only when Auth reports no verified user", async () => {
    installClient({ authenticated: false });

    await expect(requireCurrentAccount()).rejects.toThrowError("NEXT_REDIRECT:/login");
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith("/login");
  });

  it.each([
    ["a thrown Auth transport", { authThrows: true } satisfies ClientOptions],
    ["a failed server client factory", { factoryThrows: true } satisfies ClientOptions],
  ])("raises a generic server error for %s instead of redirecting", async (_label, options) => {
    installClient(options);

    await expect(requireCurrentAccount()).rejects.toThrowError(
      ACCOUNT_OVERVIEW_UNAVAILABLE_MESSAGE,
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("never leaks configuration detail from a failed client factory", async () => {
    installClient({ factoryThrows: true });

    await expect(requireCurrentAccount()).rejects.toSatisfy((error: unknown) => {
      const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      return (
        text === `AccountOverviewUnavailableError: ${ACCOUNT_OVERVIEW_UNAVAILABLE_MESSAGE}` &&
        !text.includes("SUPABASE_URL")
      );
    });
  });
});
