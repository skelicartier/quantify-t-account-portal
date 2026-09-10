import {
  ACCOUNT_PROFILE_ENDPOINT,
  loadAccountProfile,
  PROFILE_UNAVAILABLE_MESSAGE,
  type ProfileDataClient,
} from "@/lib/dal/profile-query";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  fetchAccountApiProfile: vi.fn(),
}));

vi.mock("@/lib/admin/account-api", () => ({
  fetchAccountApiProfile: mocks.fetchAccountApiProfile,
}));

type ClientOptions = {
  authenticated?: boolean;
  ownerId?: string;
  row?: unknown;
  queryError?: unknown;
  authThrows?: boolean;
  queryThrows?: boolean;
  accessToken?: string | null;
};

function profileRow(ownerId: string) {
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
    app_passcode_hash: "must-not-be-selected",
    profile_photo_path: "/Users/person/Pictures/avatar.png",
  };
}

function createClient(options?: ClientOptions) {
  const authenticated = options?.authenticated ?? true;
  const row = options && "row" in options ? options.row : profileRow(options?.ownerId ?? USER_ID);
  mocks.fetchAccountApiProfile.mockImplementation(async () => {
    if (options?.queryThrows) throw new Error("provider transport failed");
    if (options?.queryError) throw new Error("permission denied for relation app_profiles");
    return { profile: row };
  });
  const getUser = vi.fn(async () => {
    if (options?.authThrows) throw new Error("auth transport failed");
    return authenticated ? { id: USER_ID, email: "user@example.com" } : null;
  });
  const getAccessToken = vi.fn(() =>
    options && "accessToken" in options ? options.accessToken : "bearer-token",
  );
  return {
    client: { getUser, getAccessToken } as unknown as ProfileDataClient,
    getUser,
    getAccessToken,
  };
}

describe("profile DAL query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies Azure auth before reading the caller profile through the Account API", async () => {
    const { client, getUser, getAccessToken } = createClient();

    const result = await loadAccountProfile(client);

    expect(result).toMatchObject({ userId: USER_ID, profileVersion: 2 });
    expect(getUser).toHaveBeenCalledBefore(getAccessToken);
    expect(mocks.fetchAccountApiProfile).toHaveBeenCalledWith("bearer-token");
    expect(ACCOUNT_PROFILE_ENDPOINT).toBe("auth/user/profile");
  });

  it("never projects the legacy desktop-owned photo column", async () => {
    const { client } = createClient();

    const result = await loadAccountProfile(client);

    expect(JSON.stringify(result)).not.toContain("photo");
    expect(JSON.stringify(result)).not.toContain("avatar.png");
  });

  it("returns null only for an unauthenticated session and never queries", async () => {
    const { client } = createClient({ authenticated: false });
    await expect(loadAccountProfile(client)).resolves.toBeNull();
    expect(mocks.fetchAccountApiProfile).not.toHaveBeenCalled();
  });

  it.each([
    ["a provider row owned by another UUID", { ownerId: OTHER_USER_ID } satisfies ClientOptions],
    ["a provider query error", { queryError: { code: "57014" } } satisfies ClientOptions],
    ["an absent profile row", { row: null } satisfies ClientOptions],
    ["a malformed profile row", { row: { user_id: USER_ID } } satisfies ClientOptions],
    ["a thrown Auth transport", { authThrows: true } satisfies ClientOptions],
    ["a thrown query transport", { queryThrows: true } satisfies ClientOptions],
    ["a missing bearer token", { accessToken: null } satisfies ClientOptions],
  ])("raises a generic unavailable error for %s", async (_label, options) => {
    const { client } = createClient(options);

    await expect(loadAccountProfile(client)).rejects.toThrowError(PROFILE_UNAVAILABLE_MESSAGE);
  });

  it("never leaks provider detail in the unavailable error", async () => {
    const { client } = createClient({
      queryError: { code: "42501", message: "permission denied for relation app_profiles" },
    });

    await expect(loadAccountProfile(client)).rejects.toSatisfy((error: unknown) => {
      const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      return (
        text === `AccountProfileUnavailableError: ${PROFILE_UNAVAILABLE_MESSAGE}` &&
        !text.includes("permission denied") &&
        !text.includes("42501")
      );
    });
  });
});
