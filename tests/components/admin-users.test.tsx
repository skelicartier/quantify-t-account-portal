import { render, screen, within } from "@testing-library/react";

import { AdminUsers } from "@/components/admin/admin-users";
import type { AccountApiMe, AccountApiAdminUsers } from "@/lib/admin/account-api";
import type { AdminUsersAccess } from "@/lib/admin/access";
import type { AssuranceState } from "@/lib/auth/assurance";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";

const me: AccountApiMe = {
  ok: true,
  correlation_id: "qt-correlation",
  user: { user_id: USER_ID, email: "owner@example.test", is_active: true },
  role: {
    effective: "owner",
    database: "owner",
    legacy: "admin",
    mismatch: "expected-owner-projection",
    break_glass: false,
  },
  capabilities: ["account:read-self", "account:read-any"],
  environment: "staging",
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

const users: AccountApiAdminUsers = {
  ok: true,
  correlation_id: "qt-users",
  generated_at: "2026-09-04T08:54:54Z",
  pagination: { limit: 25, offset: 0, has_more: true, next_offset: 25 },
  users: [
    {
      user: {
        user_id: USER_ID,
        email: "owner@example.test",
        first_name: "Owner",
        last_name: "One",
        display_name: "Owner One",
        is_active: true,
        subscription_tier: "pro",
        created_at: "2026-09-01T00:00:00Z",
        last_login_at: "2026-09-04T00:00:00Z",
        updated_at: "2026-09-04T00:00:00Z",
      },
      role: me.role,
    },
  ],
};

describe("AdminUsers", () => {
  it("renders a read-only user directory with pagination", () => {
    render(
      <AdminUsers
        access={
          {
            status: "authorized",
            me,
            assurance,
            users,
            limit: 25,
            offset: 0,
          } satisfies AdminUsersAccess
        }
      />,
    );

    expect(screen.getByRole("heading", { name: "Users" })).toBeVisible();
    expect(screen.getByText("owner@example.test")).toBeVisible();
    expect(screen.getByText("Owner One")).toBeVisible();
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/admin/users?offset=25&limit=25",
    );
    const table = screen.getByRole("table");
    expect(within(table).getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      `/admin/users/${USER_ID}`,
    );
    expect(screen.queryByText(/pin|passcode|password hash/i)).not.toBeInTheDocument();
  });

  it("renders the privileged assurance gate before user records", () => {
    render(
      <AdminUsers
        access={
          {
            status: "mfa-required",
            me,
            assurance: { ...assurance, currentLevel: "aal1", challengeRequired: true },
          } satisfies AdminUsersAccess
        }
      />,
    );

    expect(screen.getByRole("heading", { name: /verified second factor/i })).toBeVisible();
    expect(screen.queryByText("owner@example.test")).not.toBeInTheDocument();
  });
});
