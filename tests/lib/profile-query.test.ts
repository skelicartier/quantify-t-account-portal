import {
  ACCOUNT_PROFILE_DETAIL_COLUMNS,
  loadAccountProfile,
  PROFILE_UNAVAILABLE_MESSAGE,
  type ProfileDataClient,
} from "@/lib/dal/profile-query";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";

type ClientOptions = {
  authenticated?: boolean;
  ownerId?: string;
  row?: unknown;
  queryError?: unknown;
  authThrows?: boolean;
  queryThrows?: boolean;
};

function profileRow(ownerId: string) {
  return {
    user_id: ownerId,
    first_name: "Avery",
    last_name: "Stone",
    phone: "",
    country: "United States",
    timezone: "UTC",
    default_currency: "USD",
    notify_price_alerts: true,
    notify_portfolio_moves: true,
    notify_news_digest: false,
    profile_version: 2,
    updated_at: "2026-09-02T08:00:00.000Z",
    app_passcode_hash: "must-not-be-selected",
    profile_photo_path: "/Users/person/Pictures/avatar.png",
  };
}

function createClient(options?: ClientOptions) {
  const authenticated = options?.authenticated ?? true;
  const row = options && "row" in options ? options.row : profileRow(options?.ownerId ?? USER_ID);
  const maybeSingle = vi.fn(async () => {
    if (options?.queryThrows) throw new Error("provider transport failed");
    return { data: row, error: options?.queryError ?? null };
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const getUser = vi.fn(async () => {
    if (options?.authThrows) throw new Error("auth transport failed");
    return {
      data: { user: authenticated ? { id: USER_ID, email: "user@example.com" } : null },
      error: authenticated ? null : { code: "bad_jwt" },
    };
  });
  return {
    client: { auth: { getUser }, from } as unknown as ProfileDataClient,
    getUser,
    from,
    select,
    eq,
  };
}

describe("profile DAL query", () => {
  it("verifies Auth before an explicit UUID-owner query", async () => {
    const { client, getUser, from, select, eq } = createClient();

    const result = await loadAccountProfile(client);

    expect(result).toMatchObject({ userId: USER_ID, profileVersion: 2 });
    expect(getUser).toHaveBeenCalledBefore(from);
    expect(from).toHaveBeenCalledWith("app_profiles");
    expect(select).toHaveBeenCalledWith(ACCOUNT_PROFILE_DETAIL_COLUMNS);
    expect(ACCOUNT_PROFILE_DETAIL_COLUMNS).not.toContain("*");
    expect(ACCOUNT_PROFILE_DETAIL_COLUMNS).not.toContain("passcode");
    expect(ACCOUNT_PROFILE_DETAIL_COLUMNS).not.toContain("role");
    expect(eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("never selects or projects the legacy desktop-owned photo column", async () => {
    const { client, select } = createClient();

    const result = await loadAccountProfile(client);

    expect(ACCOUNT_PROFILE_DETAIL_COLUMNS).not.toContain("photo");
    expect(select).toHaveBeenCalledWith(ACCOUNT_PROFILE_DETAIL_COLUMNS);
    expect(JSON.stringify(result)).not.toContain("photo");
    expect(JSON.stringify(result)).not.toContain("avatar.png");
  });

  it("returns null only for an unauthenticated session and never queries", async () => {
    const { client, from } = createClient({ authenticated: false });
    await expect(loadAccountProfile(client)).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a provider row owned by another UUID",
      { ownerId: "22222222-2222-4222-8222-222222222222" } satisfies ClientOptions,
    ],
    ["a provider query error", { queryError: { code: "57014" } } satisfies ClientOptions],
    ["an absent profile row", { row: null } satisfies ClientOptions],
    ["a malformed profile row", { row: { user_id: USER_ID } } satisfies ClientOptions],
    ["a thrown Auth transport", { authThrows: true } satisfies ClientOptions],
    ["a thrown query transport", { queryThrows: true } satisfies ClientOptions],
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
