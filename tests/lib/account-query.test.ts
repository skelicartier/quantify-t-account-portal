import {
  ACCOUNT_OVERVIEW_UNAVAILABLE_MESSAGE,
  ACCOUNT_PROFILE_ENDPOINT,
  loadAccountOverview,
  type AccountDataClient,
} from "@/lib/dal/account-query";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  fetchAccountApiProfile: vi.fn(),
}));

vi.mock("@/lib/admin/account-api", () => ({
  fetchAccountApiProfile: mocks.fetchAccountApiProfile,
}));

function profile(ownerId = USER_ID) {
  return {
    user_id: ownerId,
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
    profile_version: 2,
    created_at: "2024-01-03T03:04:05.000Z",
    last_login_at: "",
    updated_at: "2026-09-02T08:00:00.000Z",
  };
}

function createClient(options?: {
  authenticated?: boolean;
  profileError?: boolean;
  authThrows?: boolean;
  malformedIdentity?: boolean;
  crossOwnerRow?: boolean;
  accessToken?: string | null;
}) {
  const authenticated = options?.authenticated ?? true;
  mocks.fetchAccountApiProfile.mockImplementation(async () => {
    if (options?.profileError) throw new Error("provider detail must remain server-side");
    return { profile: profile(options?.crossOwnerRow ? OTHER_USER_ID : USER_ID) };
  });
  const getUser = vi.fn().mockImplementation(async () => {
    if (options?.authThrows) throw new Error("auth transport failed");
    return authenticated
      ? {
          id: options?.malformedIdentity ? "not-a-uuid" : USER_ID,
          email: "user@example.com",
          email_confirmed: true,
        }
      : null;
  });
  const getAccessToken = vi.fn(() =>
    options && "accessToken" in options ? options.accessToken : "bearer-token",
  );

  return {
    client: { getUser, getAccessToken } as unknown as AccountDataClient,
    getUser,
    getAccessToken,
  };
}

describe("account DAL query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies the Auth user before reading the profile through the Account API", async () => {
    const { client, getUser, getAccessToken } = createClient();

    const overview = await loadAccountOverview(client);

    expect(overview).toMatchObject({
      userId: USER_ID,
      emailConfirmed: true,
      profileState: "ready",
    });
    expect(getUser).toHaveBeenCalledBefore(getAccessToken);
    expect(mocks.fetchAccountApiProfile).toHaveBeenCalledWith("bearer-token");
    expect(ACCOUNT_PROFILE_ENDPOINT).toBe("auth/user/profile");
  });

  it("does not query profile data without a server-verified user", async () => {
    const { client } = createClient({ authenticated: false });

    await expect(loadAccountOverview(client)).resolves.toBeNull();
    expect(mocks.fetchAccountApiProfile).not.toHaveBeenCalled();
  });

  it("returns a restricted identity-only DTO when the profile provider is unavailable", async () => {
    const { client } = createClient({ profileError: true });

    await expect(loadAccountOverview(client)).resolves.toMatchObject({
      profileState: "unavailable",
      status: "unknown",
      subscriptionTier: "free",
    });
  });

  it("degrades a cross-owner profile row instead of exposing it", async () => {
    const { client } = createClient({ crossOwnerRow: true });

    const overview = await loadAccountOverview(client);

    expect(overview?.userId).toBe(USER_ID);
    expect(overview?.profileState).not.toBe("ready");
    expect(JSON.stringify(overview)).not.toContain(OTHER_USER_ID);
  });

  it.each([
    ["a thrown Auth transport", { authThrows: true }],
    ["an unusable verified identity", { malformedIdentity: true }],
    ["a missing bearer token", { accessToken: null }],
  ])("raises a generic unavailable error for %s", async (_label, options) => {
    const { client } = createClient(options);

    await expect(loadAccountOverview(client)).rejects.toThrowError(
      ACCOUNT_OVERVIEW_UNAVAILABLE_MESSAGE,
    );
  });

  it("never leaks provider detail in the unavailable error", async () => {
    const { client } = createClient({ authThrows: true });

    await expect(loadAccountOverview(client)).rejects.toSatisfy((error: unknown) => {
      const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      return (
        text === `AccountOverviewUnavailableError: ${ACCOUNT_OVERVIEW_UNAVAILABLE_MESSAGE}` &&
        !text.includes("transport")
      );
    });
  });
});
