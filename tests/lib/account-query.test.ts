import {
  ACCOUNT_PROFILE_COLUMNS,
  loadAccountOverview,
  type AccountDataClient,
} from "@/lib/dal/account-query";

function createClient(options?: { authenticated?: boolean; profileError?: boolean }) {
  const authenticated = options?.authenticated ?? true;
  const maybeSingle = vi.fn().mockResolvedValue(
    options?.profileError
      ? { data: null, error: { message: "provider detail must remain server-side" } }
      : {
          data: {
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
  const getUser = vi.fn().mockResolvedValue({
    data: {
      user: authenticated
        ? {
            id: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
            email: "user@example.com",
            created_at: "2024-01-02T03:04:05.000Z",
            last_sign_in_at: null,
            email_confirmed_at: "2024-01-02T03:05:00.000Z",
          }
        : null,
    },
    error: authenticated ? null : { message: "invalid session" },
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
});
