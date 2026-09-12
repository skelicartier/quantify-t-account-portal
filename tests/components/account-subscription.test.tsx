import { render, screen, within } from "@testing-library/react";

import { AccountSubscription } from "@/components/account/account-subscription";
import type { AccountApiEntitlements } from "@/lib/admin/account-api";
import type { AccountSubscriptionView } from "@/lib/dal/subscription";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";
const NOW = Date.parse("2026-09-12T12:00:00Z");

const entitlements: AccountApiEntitlements = {
  ok: true,
  correlation_id: "qt-entitlements",
  plan: "pro",
  entitlement_version: 7,
  chat_model: "claude-haiku",
  generated_at: "2026-09-12T11:59:00Z",
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
      reason: "Northgate pilot, agreed 60 days",
    },
    pulse_universe: {
      period: "lifetime",
      source: "plan",
      limit: 250,
      used: 0,
      reserved: 0,
      remaining: 250,
    },
    tracked_symbols: {
      period: "lifetime",
      source: "plan",
      limit: 500,
      used: 0,
      reserved: 0,
      remaining: 500,
    },
    watchlists: {
      period: "lifetime",
      source: "plan",
      limit: 25,
      used: 0,
      reserved: 0,
      remaining: 25,
    },
    portfolios: {
      period: "lifetime",
      source: "plan",
      limit: 10,
      used: 0,
      reserved: 0,
      remaining: 10,
    },
    saved_screens: {
      period: "lifetime",
      source: "plan",
      limit: 50,
      used: 0,
      reserved: 0,
      remaining: 50,
    },
    history_years: {
      period: "lifetime",
      source: "plan",
      limit: 15,
      used: 0,
      reserved: 0,
      remaining: 15,
    },
    point_in_time: { period: "lifetime", source: "plan", enabled: true },
    export: { period: "lifetime", source: "plan", enabled: true },
  },
};

const view: AccountSubscriptionView = {
  account: {
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
  },
  entitlements,
  history: [
    {
      id: "8e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66",
      userId: USER_ID,
      sessionId: null,
      eventType: "account.entitlement_changed",
      outcome: "success",
      source: "account-api",
      occurredAt: "2026-09-05T10:00:00Z",
      createdAt: "2026-09-05T10:00:00Z",
    },
  ],
  historyUnavailable: false,
};

function cellsOf(element: HTMLElement) {
  return within(element).getAllByRole("cell");
}

describe("AccountSubscription", () => {
  it("shows the plan, its allowances, and what has been spent against them", () => {
    render(<AccountSubscription view={view} now={NOW} />);

    expect(screen.getByRole("heading", { name: "Pro plan" })).toBeVisible();
    expect(screen.getByText("Claude Haiku")).toBeVisible();

    const chat = cellsOf(screen.getByRole("row", { name: /AI chat/iu }));
    expect(chat[1]).toHaveTextContent("300 messages a month");
    expect(chat[2]).toHaveTextContent("Included with Pro");
    expect(chat[3]).toHaveTextContent("43 of 300");
  });

  it("marks a granted allowance as granted, beside what the plan alone includes", () => {
    render(<AccountSubscription view={view} now={NOW} />);

    const research = cellsOf(screen.getByRole("row", { name: /Deep Research/iu }));
    expect(research[1]).toHaveTextContent("10 reports a month");
    expect(research[2]).toHaveTextContent("100 reports a month");
    expect(research[2]).toHaveTextContent("Granted for your account");
    expect(research[2]).toHaveTextContent("Northgate pilot, agreed 60 days");
  });

  it("renders a reset as an instant the reader's browser can localise", () => {
    render(<AccountSubscription view={view} now={NOW} />);

    const chat = cellsOf(screen.getByRole("row", { name: /AI chat/iu }));
    const reset = within(chat[4]!).getByRole("time");
    expect(reset).toHaveAttribute("datetime", "2026-10-01T00:00:00.000Z");
    expect(reset).toHaveAttribute("title", "1 Oct 2026, 00:00 UTC (UTC)");

    // A ceiling is not a period, so it never claims to reset.
    expect(cellsOf(screen.getByRole("row", { name: /Watchlists/iu }))[4]).toHaveTextContent(
      "Does not reset",
    );
  });

  it("never shows Pulse as metered", () => {
    render(<AccountSubscription view={view} now={NOW} />);

    const pulse = cellsOf(screen.getByRole("row", { name: /Pulse universe/iu }));
    expect(pulse[3]).toHaveTextContent("Not metered");
    expect(screen.getByText("Never metered")).toBeVisible();
  });

  it("lists the changes made to the plan, and says when that list is missing", () => {
    const { rerender } = render(<AccountSubscription view={view} now={NOW} />);

    const history = screen.getByRole("table", { name: "Changes to your plan" });
    expect(within(history).getByRole("row", { name: /Override changed/iu })).toBeVisible();

    rerender(
      <AccountSubscription view={{ ...view, history: [], historyUnavailable: true }} now={NOW} />,
    );
    expect(screen.getByText(/history could not be loaded/iu)).toBeVisible();
    expect(screen.getByText("No plan changes have been recorded.")).toBeVisible();
  });

  it("announces a live trial with the instant it ends and what it reverts to", () => {
    /**
     * During a trial the profile still says `free` while the server serves Desk's limits.
     * The page labels the numbers with the plan they belong to — the trial's — and names
     * the stored tier only as what the account drops back to. Labelling them with the
     * stored tier put "Included with Free" beside a 1,000-message allowance.
     */
    render(
      <AccountSubscription
        view={{
          ...view,
          entitlements: {
            ...entitlements,
            plan: "desk",
            stored_plan: "free",
            trial_ends_at: "2026-09-26T00:00:00Z",
            features: {
              ...entitlements.features,
              ai_chat: {
                period: "month",
                source: "plan",
                limit: 1000,
                used: 42,
                reserved: 1,
                remaining: 957,
                resets_at: "2026-10-01T00:00:00Z",
                period_key: "2026-09",
              },
            },
          },
        }}
        now={NOW}
      />,
    );

    const trial = screen.getByRole("status");
    expect(trial).toHaveTextContent("You are on a Desk trial");
    expect(trial).toHaveTextContent("returns to the Free plan");
    expect(within(trial).getByRole("time")).toHaveAttribute("datetime", "2026-09-26T00:00:00.000Z");

    // The allowances are labelled with the plan they came from, not with the stored tier.
    const row = screen.getByRole("row", { name: /AI chat/iu });
    expect(row).toHaveTextContent("Included with Desk");
    expect(row).not.toHaveTextContent("Included with Free");
  });

  it("explains a trial's own cap rather than calling it the plan's allowance", () => {
    /**
     * A trial caps Deep Research below the plan it otherwise grants, and the API says so
     * in `reason`. Dropping that labelled the capped number as the Desk plan default,
     * which is a different and much larger one.
     */
    render(
      <AccountSubscription
        view={{
          ...view,
          entitlements: {
            ...entitlements,
            plan: "desk",
            stored_plan: "free",
            trial_ends_at: "2026-09-26T00:00:00Z",
            features: {
              ...entitlements.features,
              deep_research: {
                period: "month",
                source: "plan",
                limit: 8,
                used: 1,
                reserved: 0,
                remaining: 7,
                resets_at: "2026-10-01T00:00:00Z",
                period_key: "2026-09",
                reason: "trial",
              },
            },
          },
        }}
        now={NOW}
      />,
    );

    const row = screen.getByRole("row", { name: /Deep Research/iu });
    expect(row).toHaveTextContent("Trial allowance");
    expect(row).not.toHaveTextContent("Included with Desk");
  });
});
