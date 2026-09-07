import { render, screen, within } from "@testing-library/react";

import { AccountSessions } from "@/components/account/account-sessions";
import type { AccountSessionDto } from "@/lib/dto/session";

const sessions: AccountSessionDto[] = [
  {
    id: "4a9d2d8b-f3b4-430f-9554-5e6cfb9d9a80",
    userId: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
    source: "web",
    provider: "supabase",
    clientInstanceId: "browser-instance",
    deviceName: "Safari on macOS",
    createdAt: "2026-09-01T08:00:00.000Z",
    lastSeenAt: "2026-09-03T08:00:00.000Z",
    expiresAt: "2026-09-04T08:00:00.000Z",
    revokedAt: null,
    revokeReason: null,
    status: "active",
  },
  {
    id: "89cda1d8-f0e2-4480-80d9-b057b1d9809f",
    userId: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
    source: "desktop",
    provider: "supabase",
    clientInstanceId: null,
    deviceName: null,
    createdAt: "2026-08-01T08:00:00.000Z",
    lastSeenAt: "2026-08-02T08:00:00.000Z",
    expiresAt: null,
    revokedAt: "2026-08-02T08:10:00.000Z",
    revokeReason: "signed out",
    status: "revoked",
  },
];

describe("AccountSessions", () => {
  it("renders a minimized session inventory without sensitive network metadata", () => {
    render(<AccountSessions sessions={sessions} />);

    expect(screen.getByRole("heading", { name: "Sessions" })).toBeVisible();
    expect(screen.getByText("Safari on macOS")).toBeVisible();
    expect(screen.getAllByText("Desktop")).toHaveLength(2);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Active")).toBeVisible();
    expect(within(table).getByText("Revoked")).toBeVisible();
    expect(screen.queryByText(/192\.0\.2\.1|mozilla|user-agent/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/passcode|pin/i)).not.toBeInTheDocument();
  });

  it("renders an empty state", () => {
    render(<AccountSessions sessions={[]} />);

    expect(screen.getByText(/no cloud sessions/i)).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
