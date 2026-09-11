import { render, screen, within } from "@testing-library/react";

import { AdminDashboard } from "@/components/admin/admin-dashboard";
import type {
  AccountApiAdminMetrics,
  AccountApiMe,
  AccountApiRoleReport,
} from "@/lib/admin/account-api";
import type { AdminDashboardAccess } from "@/lib/admin/access";
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
  correlation_id: "qt-correlation",
  legacy_source_available: true,
  legacy_retirement_ready: false,
  legacy_blob_entry_count: 3,
  legacy_unparsable_entry_count: 0,
  legacy_entry_count: 4,
  legacy_bootstrap_count: 1,
  counts_by_mismatch: { "missing-in-database": 1 },
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

const metrics: AccountApiAdminMetrics = {
  ok: true,
  correlation_id: "qt-metrics",
  generated_at: "2026-09-04T08:54:54Z",
  window: { hours: 24, since: "2026-09-03T08:54:54Z" },
  accounts: {
    total: 42,
    active: 40,
    inactive: 2,
    created_24h: 3,
    logged_in_24h: 18,
  },
  sessions: {
    total: 12,
    active: 7,
    expired: 4,
    revoked: 1,
    by_source: { portal: 5, desktop: 7 },
  },
  auth_events_24h: {
    total: 22,
    by_type: { "session.registered": 9 },
    by_outcome: { success: 20, blocked: 2 },
    by_source: { "account-api": 22 },
  },
  limits: {
    row_limit: 10000,
    accounts_truncated: false,
    sessions_truncated: false,
    events_truncated: false,
  },
};

describe("AdminDashboard", () => {
  it("renders authorized backend capabilities and role reconciliation", () => {
    render(
      <AdminDashboard
        access={
          {
            status: "authorized",
            me,
            assurance,
            metrics,
            roleReport,
            degraded: [],
          } satisfies AdminDashboardAccess
        }
      />,
    );

    expect(screen.getByRole("heading", { name: "Control center" })).toBeVisible();
    expect(screen.getByText("owner@example.test")).toBeVisible();
    expect(screen.getByText("42")).toBeVisible();
    expect(screen.getByText("Active sessions")).toBeVisible();
    expect(screen.getByText("Desktop sessions")).toBeVisible();
    expect(screen.getByText("Manage roles")).toBeVisible();
    expect(screen.queryByText("roles:write")).not.toBeInTheDocument();
    expect(screen.getByText("Differences need review")).toBeVisible();
    const table = screen.getByRole("table");
    expect(within(table).getByText("7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66")).toBeVisible();
    expect(screen.queryByText(/pin|passcode/i)).not.toBeInTheDocument();
  });

  it("renders a second-factor gate before privileged data", () => {
    render(
      <AdminDashboard
        access={
          {
            status: "mfa-required",
            me,
            assurance: { ...assurance, currentLevel: "aal1", challengeRequired: true },
          } satisfies AdminDashboardAccess
        }
      />,
    );

    expect(screen.getByRole("heading", { name: /verified second factor/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /security settings/i })).toHaveAttribute(
      "href",
      "/account/security",
    );
    expect(screen.queryByText("Manage roles")).not.toBeInTheDocument();
  });

  it("renders a forbidden state for active non-admin accounts", () => {
    render(
      <AdminDashboard
        access={
          {
            status: "forbidden",
            me: {
              ...me,
              role: { ...me.role, effective: "user", database: "user", legacy: "user" },
              capabilities: ["account:read-self"],
            },
          } satisfies AdminDashboardAccess
        }
      />,
    );

    expect(screen.getByRole("heading", { name: /not authorized/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /return to account/i })).toHaveAttribute(
      "href",
      "/account",
    );
  });
});
