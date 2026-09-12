import type {
  AccountApiAdminSubscriptions,
  AccountApiAdminUserEntitlements,
  AccountApiAdminUsers,
  AccountApiMe,
} from "@/lib/admin/account-api";
import type { AssuranceState } from "@/lib/auth/assurance";

const OWNER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";
const TARGET_ID = "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66";

const me: AccountApiMe = {
  ok: true,
  correlation_id: "qt-me",
  user: { user_id: OWNER_ID, email: "owner@example.test", is_active: true },
  role: {
    effective: "owner",
    database: "owner",
    legacy: "admin",
    mismatch: "expected-owner-projection",
    break_glass: false,
  },
  capabilities: ["account:read-self", "account:read-any", "audit:read", "subscription:write"],
  environment: "production",
};

const assurance: AssuranceState = {
  verifiedTotpFactors: [],
  unverifiedTotpFactorIds: [],
  currentLevel: "aal2",
  requiredLevel: "aal2",
  mfaEnrolled: true,
  challengeRequired: false,
  levelReadable: true,
  factorsReadable: true,
};

const subscriptions: AccountApiAdminSubscriptions = {
  ok: true,
  correlation_id: "qt-subscriptions",
  generated_at: "2026-09-12T11:00:00Z",
  plans: { free: 2, professional: 1 },
  total_accounts: 3,
};

const users: AccountApiAdminUsers = {
  ok: true,
  correlation_id: "qt-users",
  generated_at: "2026-09-12T11:00:00Z",
  pagination: { limit: 24, offset: 0, has_more: false, next_offset: null, total: 1 },
  users: [
    {
      user: {
        user_id: TARGET_ID,
        email: "person@example.test",
        first_name: "Pat",
        last_name: "Person",
        display_name: "Pat Person",
        is_active: true,
        subscription_tier: "pro",
        created_at: "2026-01-01T00:00:00Z",
        last_login_at: "2026-09-12T09:00:00Z",
        updated_at: "2026-09-12T09:00:00Z",
      },
      role: {
        effective: "user",
        database: "user",
        legacy: null,
        mismatch: "missing-in-legacy",
        break_glass: false,
      },
    },
  ],
};

/**
 * The account's own resolved allowance: 299 of 300 spent on the plan default, and a
 * deep_research limit that was *granted*, not published — the case that reading usage
 * alone could not see.
 */
const entitlements: AccountApiAdminUserEntitlements = {
  ok: true,
  correlation_id: "qt-entitlements",
  user_id: TARGET_ID,
  profile_version: 4,
  plan: "pro",
  entitlement_version: 6,
  generated_at: "2026-09-12T11:00:00Z",
  ttl_seconds: 300,
  features: {
    ai_chat: {
      period: "month",
      source: "plan",
      limit: 300,
      used: 299,
      reserved: 0,
      remaining: 1,
      period_key: "2026-09",
      resets_at: "2026-10-01T00:00:00Z",
    },
    deep_research: {
      period: "month",
      source: "override",
      limit: 100,
      used: 12,
      reserved: 0,
      remaining: 88,
      period_key: "2026-09",
      resets_at: "2026-10-01T00:00:00Z",
      reason: "Northgate pilot",
    },
  },
};

const auditEvents = {
  ok: true as const,
  correlation_id: "qt-audit",
  generated_at: "2026-09-12T11:00:00Z",
  pagination: { limit: 25, offset: 0, has_more: false, next_offset: null },
  filters: {},
  events: [
    {
      id: "evt-old",
      subject_user_id: TARGET_ID,
      subject_email: "person@example.test",
      actor_user_id: OWNER_ID,
      actor_email: "owner@example.test",
      session_id: null,
      event_type: "account.subscription_changed",
      outcome: "success" as const,
      source: "account-api",
      request_id: "qt-req",
      occurred_at: "2026-09-01T00:00:00Z",
      created_at: "2026-09-01T00:00:00Z",
      summary: { actor_role: "owner" },
    },
  ],
};

type HarnessOptions = {
  mePayload?: AccountApiMe;
  assurancePayload?: AssuranceState;
  failUsage?: boolean;
  failDistribution?: boolean;
};

async function loadHarness(options: HarnessOptions = {}) {
  vi.resetModules();

  const fetchAccountApiMe = vi.fn(async () => options.mePayload ?? me);
  const fetchAccountApiAdminSubscriptions = vi.fn(async () => {
    if (options.failDistribution) throw new Error("unavailable");
    return subscriptions;
  });
  const fetchAccountApiAdminUsers = vi.fn(async () => users);
  const fetchAccountApiAdminUserEntitlements = vi.fn(async () => {
    if (options.failUsage) throw new Error("unavailable");
    return entitlements;
  });
  const fetchAccountApiAdminAuditEvents = vi.fn(async () => auditEvents);
  const getCurrentAssurance = vi.fn(async () => options.assurancePayload ?? assurance);
  const redirect = vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  });
  const createServerAzureClient = vi.fn(async () => ({
    getAccessToken: () => "bearer-token",
  }));

  vi.doMock("@/lib/supabase/server", () => ({ createServerAzureClient }));
  vi.doMock("@/lib/dal/assurance-guard", () => ({ getCurrentAssurance }));
  vi.doMock("next/navigation", () => ({ redirect }));
  vi.doMock("@/lib/admin/account-api", async () => {
    const actual =
      await vi.importActual<typeof import("@/lib/admin/account-api")>("@/lib/admin/account-api");
    return {
      ...actual,
      fetchAccountApiMe,
      fetchAccountApiAdminSubscriptions,
      fetchAccountApiAdminUsers,
      fetchAccountApiAdminUserEntitlements,
      fetchAccountApiAdminAuditEvents,
    };
  });

  const access = await import("@/lib/admin/access");
  return {
    access,
    fetchAccountApiAdminSubscriptions,
    fetchAccountApiAdminUsers,
    fetchAccountApiAdminUserEntitlements,
    fetchAccountApiAdminAuditEvents,
  };
}

describe("admin subscriptions access", () => {
  it("reads the distribution, the accounts to scan, and both change event types", async () => {
    const harness = await loadHarness();

    const result = await harness.access.getAdminSubscriptionsAccess();

    expect(result.status).toBe("authorized");
    if (result.status !== "authorized") return;
    expect(result.subscriptions?.total_accounts).toBe(3);
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]?.entitlements?.features.ai_chat?.used).toBe(299);
    // The limit comes back with the spend, so the page never has to guess it from a plan.
    expect(result.accounts[0]?.entitlements?.features.ai_chat?.limit).toBe(300);
    expect(result.canReadChanges).toBe(true);
    expect(result.degraded).toEqual([]);
    expect(harness.fetchAccountApiAdminUserEntitlements).toHaveBeenCalledWith(
      "bearer-token",
      TARGET_ID,
    );
    expect(harness.fetchAccountApiAdminAuditEvents).toHaveBeenCalledTimes(2);
    expect(harness.fetchAccountApiAdminAuditEvents).toHaveBeenCalledWith("bearer-token", {
      filters: { event_type: "account.subscription_changed" },
      limit: 25,
      offset: 0,
    });
    expect(harness.fetchAccountApiAdminAuditEvents).toHaveBeenCalledWith("bearer-token", {
      filters: { event_type: "account.entitlement_changed" },
      limit: 25,
      offset: 0,
    });
  });

  it("bounds the allowance scan rather than reading every account's counters", async () => {
    const harness = await loadHarness();

    const result = await harness.access.getAdminSubscriptionsAccess();

    expect(result.status).toBe("authorized");
    if (result.status !== "authorized") return;
    expect(result.scanLimit).toBe(24);
    expect(harness.fetchAccountApiAdminUsers).toHaveBeenCalledWith("bearer-token", {
      limit: 24,
      offset: 0,
    });
  });

  it("degrades one panel at a time instead of failing the page", async () => {
    const harness = await loadHarness({ failDistribution: true, failUsage: true });

    const result = await harness.access.getAdminSubscriptionsAccess();

    expect(result.status).toBe("authorized");
    if (result.status !== "authorized") return;
    expect(result.subscriptions).toBeNull();
    expect(result.degraded).toContain("distribution");
    expect(result.degraded).toContain("usage");
    expect(result.accounts[0]?.entitlements).toBeNull();
    expect(result.changes).toHaveLength(2);
  });

  it("does not read the change log without the audit capability", async () => {
    const harness = await loadHarness({
      mePayload: { ...me, capabilities: ["account:read-self", "account:read-any"] },
    });

    const result = await harness.access.getAdminSubscriptionsAccess();

    expect(result.status).toBe("authorized");
    if (result.status !== "authorized") return;
    expect(result.canReadChanges).toBe(false);
    expect(result.changes).toEqual([]);
    expect(harness.fetchAccountApiAdminAuditEvents).not.toHaveBeenCalled();
  });

  it("refuses a caller with no administration access before any read", async () => {
    const harness = await loadHarness({
      mePayload: { ...me, capabilities: ["account:read-self"] },
    });

    await expect(harness.access.getAdminSubscriptionsAccess()).resolves.toMatchObject({
      status: "forbidden",
    });
    expect(harness.fetchAccountApiAdminSubscriptions).not.toHaveBeenCalled();
  });

  it("refuses a privileged caller who owes a second factor", async () => {
    const harness = await loadHarness({
      assurancePayload: { ...assurance, currentLevel: "aal1", challengeRequired: true },
    });

    await expect(harness.access.getAdminSubscriptionsAccess()).resolves.toMatchObject({
      status: "mfa-required",
    });
    expect(harness.fetchAccountApiAdminSubscriptions).not.toHaveBeenCalled();
  });
});
