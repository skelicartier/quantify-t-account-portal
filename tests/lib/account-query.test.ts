import {
  ACCOUNT_OVERVIEW_UNAVAILABLE_MESSAGE,
  ACCOUNT_PROFILE_COLUMNS,
  loadAccountOverview,
  type AccountDataClient,
} from "@/lib/dal/account-query";

function createClient(options?: {
  authenticated?: boolean;
  profileError?: boolean;
  authThrows?: boolean;
  malformedIdentity?: boolean;
  crossOwnerRow?: boolean;
}) {
  const authenticated = options?.authenticated ?? true;
  const maybeSingle = vi.fn().mockResolvedValue(
    options?.profileError
      ? { data: null, error: { message: "provider detail must remain server-side" } }
      : {
          data: {
            user_id: options?.crossOwnerRow
              ? "22222222-2222-4222-8222-222222222222"
              : "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
            first_name: "Avery",
            last_name: "Stone",
            is_active: true,
            subscription_tier: "free",
            created_at: "2024-01-03T03:04:05.000Z",
            last_login_at: null,
          },
          error: null,
        },
  );
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const getUser = vi.fn().mockImplementation(async () => {
    if (options?.authThrows) throw new Error("auth transport failed");
    return {
      data: {
        user: authenticated
          ? {
              id: options?.malformedIdentity
                ? "not-a-uuid"
                : "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
              email: "user@example.com",
              created_at: "2024-01-02T03:04:05.000Z",
              last_sign_in_at: null,
              email_confirmed_at: "2024-01-02T03:05:00.000Z",
            }
          : null,
      },
      error: authenticated ? null : { message: "invalid session" },
    };
  });

  return {
    client: { auth: { getUser }, from } as unknown as AccountDataClient,
    from,
    select,
    eq,
  };
}

describe("account DAL query", () => {
  it("verifies the Auth user before issuing an owner-scoped explicit-column query", async () => {
    const { client, from, select, eq } = createClient();

    const overview = await loadAccountOverview(client);

    expect(overview?.userId).toBe("860aac31-73fb-4e10-8f3f-bfcf22a71c11");
    expect(from).toHaveBeenCalledWith("app_profiles");
    expect(select).toHaveBeenCalledWith(ACCOUNT_PROFILE_COLUMNS);
    expect(ACCOUNT_PROFILE_COLUMNS).not.toContain("*");
    expect(ACCOUNT_PROFILE_COLUMNS).not.toContain("passcode");
    expect(eq).toHaveBeenCalledWith("user_id", "860aac31-73fb-4e10-8f3f-bfcf22a71c11");
  });

  it("does not query profile data without a server-verified user", async () => {
    const { client, from } = createClient({ authenticated: false });

    await expect(loadAccountOverview(client)).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
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

    expect(overview?.userId).toBe("860aac31-73fb-4e10-8f3f-bfcf22a71c11");
    expect(overview?.profileState).not.toBe("ready");
    expect(JSON.stringify(overview)).not.toContain("22222222-2222-4222-8222-222222222222");
  });

  it.each([
    ["a thrown Auth transport", { authThrows: true }],
    ["an unusable verified identity", { malformedIdentity: true }],
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
