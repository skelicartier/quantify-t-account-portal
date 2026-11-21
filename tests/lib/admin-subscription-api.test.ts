import {
  AccountApiRequestError,
  AccountApiUnavailableError,
  fetchAccountApiAdminSubscriptions,
  fetchAccountApiAdminUserUsage,
  fetchAccountApiEntitlements,
  setAccountApiAdminUserEntitlement,
  setAccountApiAdminUserSubscription,
  SUBSCRIPTION_WRITE_CAPABILITY,
  type AccountApiAdminSubscriptionUpdate,
  type AccountApiAdminSubscriptions,
  type AccountApiAdminUserUsage,
  type AccountApiEntitlements,
} from "@/lib/admin/account-api";

const ACCOUNT_API_URL = "https://account-api.example.test/api/v1";
const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";
const environment = { QT_ACCOUNT_API_URL: ACCOUNT_API_URL };

type TestFetcher = (input: URL, init: RequestInit) => Promise<Response>;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const entitlements: AccountApiEntitlements = {
  ok: true,
  correlation_id: "qt-entitlements",
  plan: "pro",
  entitlement_version: 7,
  chat_model: "claude-haiku",
  generated_at: "2026-09-12T10:00:00Z",
  ttl_seconds: 300,
  features: {
    ai_chat: {
      period: "month",
      source: "plan",
      limit: 300,
      used: 42,
      reserved: 1,
      remaining: 257,
      resets_at: "2026-10-01T00:00:00Z",
      period_key: "2026-09",
    },
    deep_research: {
      period: "month",
      source: "override",
      limit: 100,
      used: 3,
      reserved: 0,
      remaining: 97,
      resets_at: "2026-10-01T00:00:00Z",
      period_key: "2026-09",
      reason: "Northgate pilot",
    },
    watchlists: {
      period: "lifetime",
      source: "plan",
      limit: null,
      used: 0,
      reserved: 0,
      remaining: null,
    },
    export: { period: "lifetime", source: "plan", enabled: true },
  },
};

const distribution: AccountApiAdminSubscriptions = {
  ok: true,
  correlation_id: "qt-subscriptions",
  generated_at: "2026-09-12T10:00:00Z",
  plans: { free: 900, professional: 320, pro: 64 },
  total_accounts: 1284,
};

const usage: AccountApiAdminUserUsage = {
  ok: true,
  correlation_id: "qt-usage",
  user_id: USER_ID,
  plan: "desk",
  generated_at: "2026-09-12T10:00:00Z",
  counters: [
    {
      feature_key: "ai_chat",
      period_key: "2026-09",
      used: 940,
      reserved: 0,
      updated_at: "2026-09-12T09:00:00Z",
    },
  ],
};

const receipt: AccountApiAdminSubscriptionUpdate = {
  ok: true,
  correlation_id: "qt-plan-change",
  user_id: USER_ID,
  plan: "desk",
  previous_plan: "pro",
  profile_version: 5,
  entitlement_version: 8,
  overrides: [],
  trial_ends_at: "",
  unchanged: false,
  event: { id: "evt-1", event_type: "account.subscription_changed" },
  replayed: false,
  legacy_mirrored: true,
};

describe("subscription Account API client", () => {
  it("names the capability the two writes require", () => {
    expect(SUBSCRIPTION_WRITE_CAPABILITY).toBe("subscription:write");
  });

  it("reads the caller's own entitlement document", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(entitlements));

    const result = await fetchAccountApiEntitlements("bearer-token", { environment, fetcher });

    expect(result.features.deep_research?.limit).toBe(100);
    expect(result.features.deep_research?.source).toBe("override");
    expect(result.features.watchlists?.limit).toBeNull();
    expect(result.features.export?.enabled).toBe(true);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url.toString()).toBe(`${ACCOUNT_API_URL}/me/entitlements`);
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer bearer-token");
  });

  it("refuses an entitlement document carrying a field the contract does not publish", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetcher = vi.fn<TestFetcher>(async () =>
      jsonResponse({
        ...entitlements,
        features: {
          ...entitlements.features,
          ai_chat: { period: "month", source: "plan", price: 9 },
        },
      }),
    );

    await expect(
      fetchAccountApiEntitlements("bearer-token", { environment, fetcher }),
    ).rejects.toBeInstanceOf(AccountApiUnavailableError);
    consoleError.mockRestore();
  });

  it("reads the plan distribution and one account's counters", async () => {
    const distributionFetcher = vi.fn<TestFetcher>(async () => jsonResponse(distribution));
    await expect(
      fetchAccountApiAdminSubscriptions("bearer-token", {
        environment,
        fetcher: distributionFetcher,
      }),
    ).resolves.toMatchObject({ total_accounts: 1284 });
    expect(distributionFetcher.mock.calls[0]?.[0].toString()).toBe(
      `${ACCOUNT_API_URL}/admin/subscriptions`,
    );

    const usageFetcher = vi.fn<TestFetcher>(async () => jsonResponse(usage));
    await expect(
      fetchAccountApiAdminUserUsage("bearer-token", USER_ID, {
        environment,
        fetcher: usageFetcher,
      }),
    ).resolves.toMatchObject({ plan: "desk" });
    expect(usageFetcher.mock.calls[0]?.[0].toString()).toBe(
      `${ACCOUNT_API_URL}/admin/users/${USER_ID}/usage`,
    );
  });

  it("refuses a usage read for anything that is not an account id", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(usage));

    await expect(
      fetchAccountApiAdminUserUsage("bearer-token", "../admin/metrics", {
        environment,
        fetcher,
      }),
    ).rejects.toBeInstanceOf(AccountApiUnavailableError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts a plan change with its compare-and-swap and an idempotency key", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(receipt));

    const result = await setAccountApiAdminUserSubscription(
      "bearer-token",
      USER_ID,
      { plan: "desk", expected_profile_version: 4 },
      { environment, fetcher, idempotencyKey: "portal-key-1" },
    );

    expect(result.previous_plan).toBe("pro");
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url.toString()).toBe(`${ACCOUNT_API_URL}/admin/users/${USER_ID}/subscription`);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("idempotency-key")).toBe("portal-key-1");
    expect(JSON.parse(String(init.body))).toEqual({ plan: "desk", expected_profile_version: 4 });
  });

  it("surfaces the version the API names when the plan write is stale", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetcher = vi.fn<TestFetcher>(async () =>
      jsonResponse(
        {
          ok: false,
          correlation_id: "qt-conflict",
          error: {
            code: "revision_conflict",
            message: "This page is out of date.",
            details: { profile_version: 9 },
          },
        },
        409,
      ),
    );

    await expect(
      setAccountApiAdminUserSubscription(
        "bearer-token",
        USER_ID,
        { plan: "desk", expected_profile_version: 4 },
        { environment, fetcher, idempotencyKey: "portal-key-2" },
      ),
    ).rejects.toMatchObject({ status: 409, code: "revision_conflict" });

    await expect(
      setAccountApiAdminUserSubscription(
        "bearer-token",
        USER_ID,
        { plan: "desk", expected_profile_version: 4 },
        { environment, fetcher, idempotencyKey: "portal-key-2" },
      ),
    ).rejects.toBeInstanceOf(AccountApiRequestError);
    consoleError.mockRestore();
  });

  it("sends an unlimited override as a null limit, never as zero", async () => {
    const fetcher = vi.fn<TestFetcher>(async () =>
      jsonResponse({
        ...receipt,
        overrides: [
          {
            feature_key: "portfolios",
            source: "override",
            source_ref: "",
            limit_value: null,
            bool_value: null,
            effective_from: "2026-09-12T10:00:00Z",
            effective_to: "2026-12-11T10:00:00Z",
            granted_by: USER_ID,
            reason: "Agreed in contract",
          },
        ],
      }),
    );

    const result = await setAccountApiAdminUserEntitlement(
      "bearer-token",
      USER_ID,
      {
        feature_key: "portfolios",
        limit_value: null,
        expires_in_days: 90,
        reason: "Agreed in contract",
      },
      { environment, fetcher, idempotencyKey: "portal-key-3" },
    );

    expect(result.overrides[0]?.limit_value).toBeNull();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url.toString()).toBe(`${ACCOUNT_API_URL}/admin/users/${USER_ID}/entitlement`);
    expect(JSON.parse(String(init.body))).toEqual({
      feature_key: "portfolios",
      limit_value: null,
      expires_in_days: 90,
      reason: "Agreed in contract",
    });
  });

  it("never posts a mutation without an idempotency key", async () => {
    const fetcher = vi.fn<TestFetcher>(async () => jsonResponse(receipt));

    await expect(
      setAccountApiAdminUserEntitlement(
        "bearer-token",
        USER_ID,
        { feature_key: "ai_chat", remove: true },
        { environment, fetcher, idempotencyKey: "" },
      ),
    ).rejects.toBeInstanceOf(AccountApiUnavailableError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
