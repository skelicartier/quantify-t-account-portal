import { render, screen, within } from "@testing-library/react";

import { AccountOverview } from "@/components/account/account-overview";
import type { AccountOverviewDto } from "@/lib/dto/account";
import type { AccountActivityEventDto, AccountSessionDto } from "@/lib/dto/session";

const account: AccountOverviewDto = {
  userId: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
  email: "user@example.com",
  displayName: "Avery Stone",
  initials: "AS",
  status: "active",
  subscriptionTier: "professional",
  memberSince: "2024-01-03T03:04:05.000Z",
  lastSignInAt: "2026-09-01T10:00:00.000Z",
  emailConfirmed: true,
  profileState: "ready",
  accessStatus: "approved",
};

const session = (
  id: string,
  status: AccountSessionDto["status"],
  deviceName: string,
): AccountSessionDto => ({
  id,
  userId: account.userId,
  source: "desktop",
  provider: "account_api",
  clientInstanceId: null,
  deviceName,
  createdAt: "2026-09-01T09:00:00.000Z",
  lastSeenAt: "2026-09-01T10:00:00.000Z",
  expiresAt: null,
  revokedAt: null,
  revokeReason: null,
  status,
});

const event: AccountActivityEventDto = {
  id: "e1",
  userId: account.userId,
  sessionId: null,
  eventType: "login.success",
  outcome: "success",
  source: "portal",
  occurredAt: "2026-09-01T10:00:00.000Z",
  createdAt: "2026-09-01T10:00:00.000Z",
};

describe("AccountOverview", () => {
  it("briefs the account: who it is, how it stands, where it is signed in and what happened", () => {
    render(
      <AccountOverview
        account={account}
        role="owner"
        sessions={[session("s1", "active", "MacBook Pro"), session("s2", "revoked", "Old laptop")]}
        events={[event]}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Avery Stone" })).toBeVisible();
    expect(screen.getByText("user@example.com")).toBeVisible();
    // The stored tier is legacy text; the plan it resolves to is what the reader is on.
    expect(screen.getAllByText("Desk").length).toBeGreaterThan(0);
    expect(screen.getByText("Active")).toBeVisible();
    expect(screen.getByText("3 Jan 2024")).toBeVisible();
    expect(screen.getByText("Owner")).toBeVisible();
    // Only live sessions are "signed in now", and the count in the header agrees.
    const live = screen.getAllByRole("region", { name: "Signed in now" })[0]!;
    expect(within(live).getByText("MacBook Pro")).toBeVisible();
    expect(within(live).queryByText("Old laptop")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All sessions" })).toHaveAttribute(
      "href",
      "/account/sessions",
    );
    expect(screen.getByText("Login Success")).toBeVisible();
    expect(screen.getByRole("link", { name: "All activity" })).toHaveAttribute(
      "href",
      "/account/activity",
    );
    // Nothing needs this account, so there is no "Needs you" list — and no link grid
    // repeating the rail's own sections.
    expect(screen.queryByRole("heading", { name: "Needs you" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /edit profile/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/passcode|pin/i)).not.toBeInTheDocument();
  });

  it("lists what needs the owner, each row opening the fix", () => {
    render(
      <AccountOverview account={{ ...account, emailConfirmed: false }} sessions={[]} events={[]} />,
    );

    expect(screen.getByRole("heading", { name: "Needs you" })).toBeVisible();
    expect(screen.getByRole("link", { name: /confirm your sign-in email/i })).toHaveAttribute(
      "href",
      "/account/security",
    );
    expect(screen.queryByText("Owner")).not.toBeInTheDocument();
  });

  it("says a list could not be read rather than showing it empty", () => {
    render(<AccountOverview account={account} sessions={null} events={null} />);

    expect(screen.getByText("Sessions could not be read just now.")).toBeVisible();
    expect(screen.getByText("Activity could not be read just now.")).toBeVisible();
    expect(screen.queryByText("Nowhere else right now.")).not.toBeInTheDocument();
  });

  it("explains a degraded profile without hiding the verified identity", () => {
    render(
      <AccountOverview account={{ ...account, profileState: "unavailable", status: "unknown" }} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/couldn't be loaded/i);
    expect(screen.getByText("user@example.com")).toBeVisible();
    expect(screen.getByText("Unknown")).toBeVisible();
    // A failed profile read is not the Free plan.
    expect(screen.queryByText("Free")).not.toBeInTheDocument();
  });
});
