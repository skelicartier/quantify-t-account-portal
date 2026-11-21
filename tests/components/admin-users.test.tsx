import { render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/users",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { AdminUsers } from "@/components/admin/admin-users";
import type {
  AccountApiAdminMetrics,
  AccountApiAdminUsers,
  AccountApiMe,
} from "@/lib/admin/account-api";
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
        access_status: "approved",
        created_at: "2026-09-01T00:00:00Z",
        last_login_at: "2026-09-04T00:00:00Z",
        updated_at: "2026-09-04T00:00:00Z",
      },
      role: me.role,
    },
  ],
};

const APPLICANT_ID = "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66";

const withApplicant: AccountApiAdminUsers = {
  ...users,
  pagination: { limit: 25, offset: 0, has_more: false, next_offset: null, total: 2 },
  users: [
    {
      user: {
        user_id: APPLICANT_ID,
        email: "priya@example.test",
        first_name: "Priya",
        last_name: "Nair",
        display_name: "Priya Nair",
        is_active: true,
        subscription_tier: "free",
        access_status: "pending",
        created_at: "2026-11-20T00:00:00Z",
        last_login_at: "",
        updated_at: "2026-11-20T00:00:00Z",
      },
      role: { ...me.role, effective: "user", database: "user", legacy: null },
    },
    ...users.users,
  ],
};

const days = Array.from({ length: 30 }, (_, index) => {
  const day = new Date(Date.UTC(2026, 7, 13 + index));
  return day.toISOString().slice(0, 10);
});

const metrics: AccountApiAdminMetrics = {
  ok: true,
  correlation_id: "qt-metrics",
  generated_at: "2026-09-11T12:00:00Z",
  window: { hours: 24, since: "2026-09-10T12:00:00Z" },
  accounts: {
    total: 182,
    active: 180,
    inactive: 2,
    created_24h: 4,
    logged_in_24h: 61,
    created_7d: 96,
    created_30d: 141,
    logged_in_7d: 120,
  },
  series: {
    days: 30,
    signups: days.map((date, index) => ({ date, count: index % 4 })),
    sign_ins: days.map((date, index) => ({ date, count: 10 + (index % 5) })),
    auth_events: days.map((date, index) => ({
      date,
      success: 20 + index,
      failure: index % 3,
      blocked: 0,
    })),
  },
  sessions: { total: 10, active: 4, expired: 5, revoked: 1, by_source: { portal: 10 } },
  auth_events_24h: {
    total: 30,
    by_type: { login: 30 },
    by_outcome: { success: 30 },
    by_source: { portal: 30 },
  },
  limits: {
    row_limit: 10000,
    accounts_truncated: false,
    sessions_truncated: false,
    events_truncated: false,
  },
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
            metrics: null,
            pendingApplications: null,
            filters: {},
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
  it("shows account KPIs, daily analytics and the export link when metrics load", () => {
    render(
      <AdminUsers
        access={
          {
            status: "authorized",
            me,
            assurance,
            users: { ...users, pagination: { ...users.pagination, total: 182 } },
            metrics,
            pendingApplications: null,
            filters: {},
            limit: 25,
            offset: 0,
          } satisfies AdminUsersAccess
        }
      />,
    );

    const totals = screen.getByRole("list", { name: "Account totals" });
    expect(within(totals).getByText("Total accounts")).toBeVisible();
    expect(within(totals).getByText("182")).toBeVisible();
    expect(within(totals).getByText("New this week")).toBeVisible();
    expect(within(totals).getByText("96")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Last 30 days" })).toBeVisible();
    expect(screen.getByRole("img", { name: /^New accounts:/u })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Authentication events:/u })).toBeInTheDocument();
    expect(screen.getByText("182 accounts")).toBeVisible();
    expect(screen.getByRole("link", { name: "Export CSV" })).toHaveAttribute(
      "href",
      "/admin/users/export",
    );
  });

  it("carries the search and status filters through paging, clearing and export", () => {
    render(
      <AdminUsers
        access={
          {
            status: "authorized",
            me,
            assurance,
            users: { ...users, pagination: { ...users.pagination, total: 3 } },
            metrics: null,
            pendingApplications: null,
            filters: { q: "owner", status: "active" },
            limit: 25,
            offset: 0,
          } satisfies AdminUsersAccess
        }
      />,
    );

    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("owner");
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("active");
    expect(screen.getByText("3 accounts match")).toBeVisible();
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/admin/users?offset=25&limit=25&q=owner&status=active",
    );
    expect(screen.getByRole("button", { name: "Clear" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Export CSV" })).toHaveAttribute(
      "href",
      "/admin/users/export?q=owner&status=active",
    );
    expect(screen.queryByRole("list", { name: "Account totals" })).not.toBeInTheDocument();
  });

  it("puts applications awaiting review in front of whoever can decide them", () => {
    const decide = vi.fn(async () => ({ status: "idle" as const, message: "" }));
    render(
      <AdminUsers
        accessAction={decide}
        access={
          {
            status: "authorized",
            me: { ...me, capabilities: [...me.capabilities, "users:set-active"] },
            assurance,
            users: withApplicant,
            metrics: null,
            pendingApplications: 3,
            filters: {},
            limit: 25,
            offset: 0,
          } satisfies AdminUsersAccess
        }
      />,
    );

    const prompt = screen.getByText("3 applications are awaiting review").closest(".callout");
    expect(prompt).not.toBeNull();
    expect(
      within(prompt as HTMLElement).getByRole("link", { name: "Review applications" }),
    ).toHaveAttribute("href", "/admin/users?access=pending");

    const table = screen.getByRole("table", { name: "Accounts" });
    const applicant = within(table).getByText("Priya Nair").closest("tr") as HTMLElement;
    expect(within(applicant).getByText("Awaiting review")).toBeVisible();
    expect(within(applicant).getByRole("button", { name: "Approve Priya Nair" })).toBeEnabled();
    expect(within(applicant).getByRole("link", { name: "Review" })).toHaveAttribute(
      "href",
      `/admin/users/${APPLICANT_ID}`,
    );
    // An approved account has nothing to approve, and nobody approves themselves.
    const owner = within(table).getByText("Owner One").closest("tr") as HTMLElement;
    expect(within(owner).getByText("Approved")).toBeVisible();
    expect(within(owner).queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the queue without an approve button to staff who cannot decide", () => {
    render(
      <AdminUsers
        accessAction={vi.fn(async () => ({ status: "idle" as const, message: "" }))}
        access={
          {
            status: "authorized",
            me,
            assurance,
            users: withApplicant,
            metrics: null,
            pendingApplications: 1,
            filters: { access: "pending" },
            limit: 25,
            offset: 0,
          } satisfies AdminUsersAccess
        }
      />,
    );

    const table = screen.getByRole("table", { name: "Accounts" });
    expect(within(table).queryByRole("button", { name: /Approve/u })).not.toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "Review" })).toBeVisible();
    // Already looking at the queue: no prompt to go and look at it.
    expect(screen.queryByText(/awaiting review$/u)).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Application" })).toHaveValue("pending");
    expect(screen.getByRole("link", { name: "Export CSV" })).toHaveAttribute(
      "href",
      "/admin/users/export?access=pending",
    );
  });

  it("says the queue is empty when nobody is waiting", () => {
    render(
      <AdminUsers
        access={
          {
            status: "authorized",
            me,
            assurance,
            users: {
              ...users,
              users: [],
              pagination: { limit: 25, offset: 0, has_more: false, next_offset: null, total: 0 },
            },
            metrics: null,
            pendingApplications: 0,
            filters: { access: "pending" },
            limit: 25,
            offset: 0,
          } satisfies AdminUsersAccess
        }
      />,
    );

    expect(screen.getByText("No applications are awaiting review.")).toBeVisible();
  });

  it("keeps the KPI strip when the directory itself fails", () => {
    render(
      <AdminUsers
        access={
          {
            status: "authorized",
            me,
            assurance,
            users: null,
            metrics,
            pendingApplications: null,
            filters: {},
            limit: 25,
            offset: 0,
          } satisfies AdminUsersAccess
        }
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("The directory couldn't be loaded");
    expect(screen.getByRole("list", { name: "Account totals" })).toBeVisible();
    // The charts keep their hidden data tables; only the directory table is absent.
    expect(screen.queryByRole("table", { name: "Accounts" })).not.toBeInTheDocument();
  });
});
