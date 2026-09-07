import { render, screen, within } from "@testing-library/react";

import { AccountActivity } from "@/components/account/account-activity";
import type { AccountActivityEventDto } from "@/lib/dto/session";

const events: AccountActivityEventDto[] = [
  {
    id: "22101fb2-9fe0-4833-8122-41d41f98f08d",
    userId: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
    sessionId: "4a9d2d8b-f3b4-430f-9554-5e6cfb9d9a80",
    eventType: "login.success",
    outcome: "success",
    source: "web",
    occurredAt: "2026-09-03T08:01:00.000Z",
    createdAt: "2026-09-03T08:01:01.000Z",
  },
  {
    id: "ad937835-fdc2-4dd1-afde-cb1a0955b01c",
    userId: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
    sessionId: null,
    eventType: "mfa.challenge",
    outcome: "blocked",
    source: "web",
    occurredAt: "2026-09-03T08:02:00.000Z",
    createdAt: "2026-09-03T08:02:01.000Z",
  },
];

describe("AccountActivity", () => {
  it("renders a redacted account activity timeline", () => {
    render(<AccountActivity events={events} />);

    expect(screen.getByRole("heading", { name: "Activity" })).toBeVisible();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Login Success")).toBeVisible();
    expect(within(table).getByText("MFA Challenge")).toBeVisible();
    expect(within(table).getByText("Blocked")).toBeVisible();
    expect(
      screen.queryByText(/metadata|request id|192\.0\.2\.1|user-agent/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/passcode|pin/i)).not.toBeInTheDocument();
  });

  it("renders an empty state", () => {
    render(<AccountActivity events={[]} />);

    expect(screen.getByText(/no security events/i)).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
