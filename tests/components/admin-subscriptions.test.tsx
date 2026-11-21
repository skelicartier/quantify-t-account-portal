import { render, screen, within } from "@testing-library/react";

import { AdminSubscriptions } from "@/components/admin/admin-subscriptions";
import type { AdminSubscriptionsAccess } from "@/lib/admin/access";
import type { AccountApiMe } from "@/lib/admin/account-api";
import type { AssuranceState } from "@/lib/auth/assurance";

const OWNER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";
const HEAVY_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c55";
const LIGHT_ID = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d66";
const NOW = Date.parse("2026-09-12T12:00:00Z");

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

function account(
  userId: string,
  name: string,
  plan: string,
  aiChat: number,
  options: { limit?: number; source?: string } = {},
) {
  const limit = options.limit ?? 300;
  return {
    user: {
      user_id: userId,
      email: `${name.toLowerCase()}@example.test`,
      first_name: name,
      last_name: "Tester",
      display_name: `${name} Tester`,
      is_active: true,
      subscription_tier: plan,
      created_at: "2026-01-01T00:00:00Z",
      last_login_at: "2026-09-12T09:00:00Z",
      updated_at: "2026-09-12T09:00:00Z",
    },
    entitlements: {
      ok: true as const,
      correlation_id: "qt-entitlements",
      user_id: userId,
      profile_version: 4,
      plan,
      entitlement_version: 6,
      generated_at: "2026-09-12T11:00:00Z",
      ttl_seconds: 300,
      features: {
        ai_chat: {
          period: "month" as const,
          source: options.source ?? "plan",
          limit,
          used: aiChat,
          reserved: 0,
          remaining: Math.max(0, limit - aiChat),
          period_key: "2026-09",
          resets_at: "2026-10-01T00:00:00Z",
        },
      },
    },
  };
}

const authorized: AdminSubscriptionsAccess = {
  status: "authorized",
  me,
  assurance,
  subscriptions: {
    ok: true,
    correlation_id: "qt-subscriptions",
    generated_at: "2026-09-12T11:59:00Z",
    plans: { free: 900, professional: 320, pro: 64 },
    total_accounts: 1284,
  },
  accounts: [account(HEAVY_ID, "Priya", "pro", 295), account(LIGHT_ID, "Leo", "professional", 12)],
  scanLimit: 24,
  changes: [
    {
      id: "evt-1",
      subject_user_id: HEAVY_ID,
      subject_email: "priya@example.test",
      actor_user_id: OWNER_ID,
      actor_email: "owner@example.test",
      session_id: null,
      event_type: "account.subscription_changed",
      outcome: "success",
      source: "account-api",
      request_id: "qt-req-1",
      occurred_at: "2026-09-12T10:00:00Z",
      created_at: "2026-09-12T10:00:00Z",
      summary: { actor_role: "owner" },
    },
  ],
  canReadChanges: true,
  degraded: [],
};

describe("AdminSubscriptions", () => {
  it("counts every stored tier under the plan it resolves to", () => {
    render(<AdminSubscriptions access={authorized} now={NOW} />);

    const summary = screen.getByRole("list", { name: "Plan distribution" });
    const stats = within(summary).getAllByRole("listitem");
    expect(stats[0]).toHaveTextContent("Active accounts1,284");
    expect(stats[1]).toHaveTextContent("Free90070%");
    // "professional" is a legacy tier that resolves to Desk, so Desk is not zero.
    expect(stats[3]).toHaveTextContent("Desk32025%");

    const tiers = screen.getByRole("region", { name: "Accounts by stored tier" });
    const legacyRow = within(tiers).getByRole("row", { name: /professional/iu });
    expect(legacyRow).toHaveTextContent("Desk");
    expect(legacyRow).toHaveTextContent("25%");
  });

  it("lists only the accounts near or over their own allowance, and says what it scanned", () => {
    render(<AdminSubscriptions access={authorized} now={NOW} />);

    const watch = screen.getByRole("region", { name: "Accounts near or over their allowance" });
    expect(within(watch).getByRole("row", { name: /Priya Tester/iu })).toHaveTextContent(
      "295 of 300",
    );
    expect(within(watch).queryByRole("row", { name: /Leo Tester/iu })).not.toBeInTheDocument();
    expect(screen.getByText(/compared against its own resolved allowance/iu)).toBeVisible();
    expect(screen.getByText(/2 most recently updated accounts/iu)).toBeVisible();
  });

  it("never calls an account over when its own granted allowance covers the spend", () => {
    /**
     * Comparing a spend against the *published plan default* declared a comped account
     * "Over allowance" while it sat well inside the limit it actually has — the single
     * most misleading thing this page could say about a paying customer, and it said it
     * on the screen an operator opens when deciding whether to intervene.
     */
    const comped = account(HEAVY_ID, "Priya", "pro", 295, { limit: 5000, source: "override" });
    render(<AdminSubscriptions access={{ ...authorized, accounts: [comped] }} now={NOW} />);

    // Nothing is near its allowance, so there is no watch row for this account anywhere.
    expect(screen.queryByRole("row", { name: /Priya Tester/iu })).not.toBeInTheDocument();
  });

  it("says when the allowance a row is measured against was granted, not published", () => {
    const granted = account(HEAVY_ID, "Priya", "pro", 990, { limit: 1000, source: "override" });
    render(<AdminSubscriptions access={{ ...authorized, accounts: [granted] }} now={NOW} />);

    const watch = screen.getByRole("region", { name: "Accounts near or over their allowance" });
    const row = within(watch).getByRole("row", { name: /Priya Tester/iu });
    expect(row).toHaveTextContent("990 of 1,000");
    expect(row).toHaveTextContent("granted allowance");
  });

  it("reads plan and override changes back out of the audit trail", () => {
    render(<AdminSubscriptions access={authorized} now={NOW} />);

    const changes = screen.getByRole("table", { name: "Recent plan and override changes" });
    const change = within(changes).getByRole("row", { name: /Plan changed/iu });
    expect(change).toHaveTextContent("priya@example.test");
    expect(change).toHaveTextContent("owner@example.test");
  });

  it("explains a missing panel instead of hiding the page", () => {
    render(
      <AdminSubscriptions
        access={{ ...authorized, subscriptions: null, degraded: ["distribution", "usage"] }}
        now={NOW}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("the plan distribution");
    expect(screen.getByRole("status")).toHaveTextContent("usage counters for some accounts");
    expect(screen.getByText("The plan distribution could not be read.")).toBeVisible();
  });

  it("tells an operator without audit access why the change log is absent", () => {
    render(
      <AdminSubscriptions
        access={{ ...authorized, canReadChanges: false, changes: [] }}
        now={NOW}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Change history needs audit access" }),
    ).toBeVisible();
  });

  it("renders the administration gate instead of the page when the role is not permitted", () => {
    render(<AdminSubscriptions access={{ status: "forbidden", me }} now={NOW} />);

    expect(
      screen.getByRole("heading", { name: /not authorized for administration/iu }),
    ).toBeVisible();
    expect(screen.queryByRole("list", { name: "Plan distribution" })).not.toBeInTheDocument();
  });
});
