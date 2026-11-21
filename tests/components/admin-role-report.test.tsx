import { render, screen, within } from "@testing-library/react";

import { AdminRoleReport } from "@/components/admin/admin-role-report";
import type { AccountApiMe, AccountApiRoleReport } from "@/lib/admin/account-api";
import type { AdminRoleReportAccess } from "@/lib/admin/access";
import type { AssuranceState } from "@/lib/auth/assurance";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";

const me: AccountApiMe = {
  ok: true,
  correlation_id: "qt-correlation",
  user: {
    user_id: USER_ID,
    email: "owner@example.test",
    is_active: true,
  },
  role: {
    effective: "owner",
    database: "owner",
    legacy: "admin",
    mismatch: "expected-owner-projection",
    break_glass: false,
  },
  capabilities: ["account:read-self", "account:read-any", "roles:read-report", "roles:write"],
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

const roleReport: AccountApiRoleReport = {
  ok: true,
  correlation_id: "qt-role-report",
  legacy_source_available: true,
  legacy_retirement_ready: false,
  legacy_blob_entry_count: 3,
  legacy_unparsable_entry_count: 0,
  legacy_entry_count: 4,
  legacy_bootstrap_count: 1,
  counts_by_mismatch: { match: 3, "missing-in-database": 1 },
  counts_by_role: { owner: 1, admin: 1, support: 1, user: 1 },
  total_users: 4,
  break_glass_disclosed: false,
  entries: [
    {
      user_id: "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66",
      effective_role: "admin",
      database_role: null,
      legacy_role: "admin",
      mismatch: "missing-in-database",
      break_glass: false,
    },
  ],
};

describe("AdminRoleReport", () => {
  it("renders the authorized reconciliation report without PIN language", () => {
    render(
      <AdminRoleReport
        access={
          {
            status: "authorized",
            me,
            assurance,
            roleReport,
            includeMatches: false,
          } satisfies AdminRoleReportAccess
        }
      />,
    );

    expect(screen.getByRole("heading", { name: "Role reconciliation" })).toBeVisible();
    expect(screen.getByText("Differences need review")).toBeVisible();
    expect(screen.queryByText("qt-role-report")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Differences" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "All entries" })).toHaveAttribute(
      "href",
      "/admin/roles?include=matches",
    );
    const table = screen.getByRole("table");
    expect(within(table).getByText("7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66")).toBeVisible();
    expect(within(table).getByText("Missing from database")).toBeVisible();
    expect(screen.queryByText(/pin|passcode/i)).not.toBeInTheDocument();
  });

  it("marks the full-entry scope when matches are included", () => {
    render(
      <AdminRoleReport
        access={
          {
            status: "authorized",
            me,
            assurance,
            roleReport: { ...roleReport, legacy_retirement_ready: true, entries: [] },
            includeMatches: true,
          } satisfies AdminRoleReportAccess
        }
      />,
    );

    expect(screen.getByText("Ready for reviewed cutover")).toBeVisible();
    expect(screen.getByRole("link", { name: "All entries" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText(/no role records were returned/i)).toBeVisible();
  });

  it("renders a capability gate before role data", () => {
    render(
      <AdminRoleReport
        access={
          {
            status: "capability-required",
            me: { ...me, capabilities: ["account:read-self", "account:read-any"] },
            assurance,
            capability: "roles:read-report",
          } satisfies AdminRoleReportAccess
        }
      />,
    );

    expect(screen.getByRole("heading", { name: /not available/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /return to dashboard/i })).toHaveAttribute(
      "href",
      "/admin",
    );
    expect(screen.queryByText("qt-role-report")).not.toBeInTheDocument();
  });

  it("renders the privileged second-factor gate before role data", () => {
    render(
      <AdminRoleReport
        access={
          {
            status: "mfa-required",
            me,
            assurance: {
              ...assurance,
              currentLevel: "aal1",
              requiredLevel: "aal2",
              challengeRequired: true,
              passkey: {
                mode: "when-enrolled",
                staff: true,
                enrolled: true,
                count: 1,
                required: true,
                verified: false,
                fresh: false,
                verifiedUntil: null,
                freshUntil: null,
              },
            },
          } satisfies AdminRoleReportAccess
        }
      />,
    );

    expect(screen.getByRole("heading", { name: /confirm it is you/i })).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
