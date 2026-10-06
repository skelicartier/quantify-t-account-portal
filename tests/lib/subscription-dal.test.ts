import type { AccountApiEntitlements } from "@/lib/admin/account-api";
import type { AccountOverviewDto } from "@/lib/dto/account";
import type { AccountActivityEventDto } from "@/lib/dto/session";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";

const account: AccountOverviewDto = {
  userId: USER_ID,
  email: "person@example.test",
  displayName: "Pat Person",
  initials: "PP",
  status: "active",
  subscriptionTier: "pro",
  memberSince: "2026-01-01T00:00:00Z",
  lastSignInAt: "2026-09-12T09:00:00Z",
  emailConfirmed: true,
  profileState: "ready",
  accessStatus: "approved",
};

const entitlements: AccountApiEntitlements = {
  ok: true,
  correlation_id: "qt-entitlements",
  plan: "pro",
  entitlement_version: 3,
  generated_at: "2026-09-12T11:00:00Z",
  ttl_seconds: 300,
  features: {
    ai_chat: {
      period: "month",
      source: "plan",
      limit: 300,
      used: 1,
      reserved: 0,
      remaining: 299,
      resets_at: "2026-10-01T00:00:00Z",
      period_key: "2026-09",
    },
  },
};

function event(id: string, eventType: string, occurredAt: string): AccountActivityEventDto {
  return {
    id,
    userId: USER_ID,
    sessionId: null,
    eventType,
    outcome: "success",
    source: "account-api",
    occurredAt,
    createdAt: occurredAt,
  };
}

const activity: AccountActivityEventDto[] = [
  event("11111111-1111-4111-8111-111111111111", "session.heartbeat", "2026-09-12T09:00:00Z"),
  event(
    "22222222-2222-4222-8222-222222222222",
    "account.subscription_changed",
    "2026-08-01T09:00:00Z",
  ),
  event(
    "33333333-3333-4333-8333-333333333333",
    "account.entitlement_changed",
    "2026-09-05T09:00:00Z",
  ),
];

type HarnessOptions = {
  token?: string | null;
  entitlementsError?: unknown;
  activityError?: unknown;
};

async function loadHarness(options: HarnessOptions = {}) {
  vi.resetModules();

  const requireCurrentAccount = vi.fn(async () => account);
  const getCurrentActivityEvents = vi.fn(async () => {
    if (options.activityError) throw options.activityError;
    return activity;
  });
  const fetchAccountApiEntitlements = vi.fn(async () => {
    if (options.entitlementsError) throw options.entitlementsError;
    return entitlements;
  });
  const redirect = vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  });
  const createServerAzureClient = vi.fn(async () => ({
    getAccessToken: () => (options.token === undefined ? "bearer-token" : options.token),
  }));

  vi.doMock("@/lib/supabase/server", () => ({ createServerAzureClient }));
  vi.doMock("next/navigation", () => ({ redirect }));
  vi.doMock("@/lib/dal/account", () => ({ requireCurrentAccount, getCurrentActivityEvents }));
  vi.doMock("@/lib/admin/account-api", async () => {
    const actual =
      await vi.importActual<typeof import("@/lib/admin/account-api")>("@/lib/admin/account-api");
    return { ...actual, fetchAccountApiEntitlements };
  });

  const dal = await import("@/lib/dal/subscription");
  return { dal, redirect, fetchAccountApiEntitlements, requireCurrentAccount };
}

describe("requireCurrentSubscription", () => {
  it("returns the caller's entitlements with only their plan history, newest first", async () => {
    const { dal, requireCurrentAccount } = await loadHarness();

    const view = await dal.requireCurrentSubscription();

    expect(requireCurrentAccount).toHaveBeenCalled();
    expect(view.entitlements.plan).toBe("pro");
    expect(view.history.map((entry) => entry.eventType)).toEqual([
      "account.entitlement_changed",
      "account.subscription_changed",
    ]);
    expect(view.historyUnavailable).toBe(false);
  });

  it("keeps the plan readable when the history cannot be loaded", async () => {
    const { dal } = await loadHarness({ activityError: new Error("unavailable") });

    const view = await dal.requireCurrentSubscription();

    expect(view.entitlements.plan).toBe("pro");
    expect(view.history).toEqual([]);
    expect(view.historyUnavailable).toBe(true);
  });

  it("sends a caller with no session back to sign in, returning to this page", async () => {
    const { dal, redirect, fetchAccountApiEntitlements } = await loadHarness({ token: null });

    await expect(dal.requireCurrentSubscription()).rejects.toThrow(/NEXT_REDIRECT/u);
    expect(redirect).toHaveBeenCalledWith("/login?next=%2Faccount%2Fsubscription");
    expect(fetchAccountApiEntitlements).not.toHaveBeenCalled();
  });

  it("reports an unreadable entitlement document as an outage, not as a sign-in problem", async () => {
    const { dal } = await loadHarness({ entitlementsError: new Error("boom") });

    await expect(dal.requireCurrentSubscription()).rejects.toMatchObject({
      name: "AccountApiUnavailableError",
    });
  });

  it("answers a held account with its hold, not with an outage", async () => {
    const { AccountApiRequestError } = await import("@/lib/admin/account-api");
    const { dal } = await loadHarness({
      entitlementsError: new AccountApiRequestError({
        status: 403,
        code: "access_pending",
        message: "provider detail",
        correlationId: null,
      }),
    });

    await expect(dal.requireCurrentSubscription()).rejects.toMatchObject({
      name: "AccountAccessHeldError",
      hold: "pending",
    });
  });
});
