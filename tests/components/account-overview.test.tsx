import { render, screen } from "@testing-library/react";

import { AccountOverview } from "@/components/account/account-overview";
import type { AccountOverviewDto } from "@/lib/dto/account";

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
};

describe("AccountOverview", () => {
  it("renders the sanitized account summary and profile navigation", () => {
    render(<AccountOverview account={account} canEnterAdmin />);

    expect(screen.getByRole("heading", { name: /account overview/i })).toBeVisible();
    expect(screen.getByText("Avery Stone")).toBeVisible();
    expect(screen.getByText("user@example.com")).toBeVisible();
    expect(screen.getByText("Professional")).toBeVisible();
    expect(screen.getByText("Active")).toBeVisible();
    expect(screen.getByText("3 Jan 2024")).toBeVisible();
    expect(screen.getByRole("link", { name: /edit profile/i })).toHaveAttribute(
      "href",
      "/account/profile",
    );
    expect(screen.getByRole("link", { name: /admin console/i })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: /preferences/i })).toHaveAttribute(
      "href",
      "/account/preferences",
    );
    expect(screen.getByRole("link", { name: /sessions/i })).toHaveAttribute(
      "href",
      "/account/sessions",
    );
    expect(screen.getByRole("link", { name: /activity/i })).toHaveAttribute(
      "href",
      "/account/activity",
    );
    expect(screen.queryByText(/passcode|pin/i)).not.toBeInTheDocument();
  });

  it("hides the admin console link for accounts the backend does not admit", () => {
    render(<AccountOverview account={account} />);

    expect(screen.queryByRole("link", { name: /admin console/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /edit profile/i })).toBeVisible();
  });

  it("explains a degraded profile without hiding the verified identity", () => {
    render(
      <AccountOverview account={{ ...account, profileState: "unavailable", status: "unknown" }} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/couldn't be loaded/i);
    expect(screen.getByText("user@example.com")).toBeVisible();
    expect(screen.getByText("Unknown")).toBeVisible();
  });
});
