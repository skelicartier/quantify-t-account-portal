import {
  AccountApiUnavailableError,
  fetchAccountApiEntitlements,
  type AccountApiEntitlements,
} from "@/lib/admin/account-api";

const ACCOUNT_API_URL = "https://account-api.example.test/api/v1";
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

describe("subscription Account API client", () => {
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
});
