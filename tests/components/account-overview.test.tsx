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
    render(<AccountOverview account={account} />);

    expect(screen.getByRole("heading", { name: /account overview/i })).toBeVisible();
    expect(screen.getByText("Avery Stone")).toBeVisible();
    expect(screen.getByText("user@example.com")).toBeVisible();
    expect(screen.getByText("Professional")).toBeVisible();
    expect(screen.getByText("Active")).toBeVisible();
    expect(screen.getByRole("link", { name: /edit profile/i })).toHaveAttribute(
      "href",
      "/account/profile",
    );
    expect(screen.getByRole("link", { name: /preferences/i })).toHaveAttribute(
      "href",
      "/account/preferences",
    );
    expect(screen.queryByText(/passcode|pin/i)).not.toBeInTheDocument();
  });
});
