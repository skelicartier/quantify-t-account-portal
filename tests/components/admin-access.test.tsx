import { render, screen, within } from "@testing-library/react";

import { AdminAccess } from "@/components/admin/admin-access";
import type { AdminStaffAccess } from "@/lib/admin/access";
import type {
  AccountApiAdminStaff,
  AccountApiMe,
  AccountApiStaffMember,
} from "@/lib/admin/account-api";
import type { AssuranceState } from "@/lib/auth/assurance";

vi.mock("@/app/admin/access/actions", () => ({ setStaffRole: vi.fn() }));

const NOW = Date.parse("2026-09-13T12:00:00Z");
const OWNER_ID = "4c7715ea-9ae3-4abd-b2f7-2d2c9a037d9b";
const ADMIN_ID = "8b2d4e61-1c3a-4f5b-8d9e-2a4c6b8d0f11";
const AGENT_ID = "5c1e7a93-2b4d-4e6f-9a1b-3c5d7e9f0a22";

const me: AccountApiMe = {
  ok: true,
  correlation_id: "qt-me",
  user: { user_id: ADMIN_ID, email: "admin@example.test", is_active: true },
  role: {
    effective: "admin",
    database: "admin",
    legacy: "admin",
    mismatch: "match",
    break_glass: false,
  },
  capabilities: ["account:read-self", "account:read-any", "staff:write"],
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

function member(overrides: Partial<AccountApiStaffMember> = {}): AccountApiStaffMember {
  return {
    user_id: AGENT_ID,
    email: "sam@example.test",
    display_name: "Sam Okafor",
    is_active: true,
    role: "support_manager",
    capabilities: ["support:read", "support:read-all", "support:reply", "support:manage"],
    mismatch: "match",
    break_glass: false,
    profile_readable: true,
    ...overrides,
  };
}

function directory(overrides: Partial<AccountApiAdminStaff> = {}): AccountApiAdminStaff {
  return {
    ok: true,
    correlation_id: "qt-staff",
    generated_at: "2026-09-13T11:55:00Z",
    members: [member()],
    roles: [
      { role: "owner", capabilities: ["roles:write"], grantable: false },
      { role: "support", capabilities: ["support:read", "support:reply"], grantable: true },
    ],
    grantable_roles: ["support_manager", "billing_manager", "auditor", "support", "user"],
    can_grant: true,
    can_assign_any_role: false,
    legacy_readable: true,
    ...overrides,
  };
}

function authorized(overrides: Partial<AccountApiAdminStaff> = {}): AdminStaffAccess {
  return { status: "authorized", me, assurance, staff: directory(overrides) };
}

describe("AdminAccess", () => {
  it("lists a staff account with its role and how much that role carries", () => {
    render(<AdminAccess access={authorized()} now={NOW} />);

    const table = screen.getByRole("region", { name: "Staff accounts" });
    expect(within(table).getByText("Sam Okafor")).toBeInTheDocument();
    expect(within(table).getByText("Support manager")).toBeInTheDocument();
    // A count, not the list. Every account holding a role has exactly that role's
    // permissions, so the list on every row is the same wall written N times — and it
    // squeezes the columns somebody actually reads. It links to the list in full.
    expect(within(table).getByRole("link", { name: "4" })).toHaveAttribute(
      "href",
      "#role-support_manager",
    );
    expect(within(table).queryByText("Assign and close support conversations")).toBeNull();
  });

  it("spells out every permission once, in the catalogue", () => {
    // Named by the service rather than described here, so what the page claims and what
    // the service enforces cannot drift.
    render(
      <AdminAccess
        access={authorized({
          roles: [
            {
              role: "support_manager",
              capabilities: ["support:manage", "support:read-all"],
              grantable: true,
            },
          ],
        })}
        now={NOW}
      />,
    );

    const card = document.querySelector("#role-support_manager");
    expect(card).not.toBeNull();
    expect(
      within(card as HTMLElement).getByText("Assign and close support conversations"),
    ).toBeInTheDocument();
    expect(
      within(card as HTMLElement).getByText("Read every support conversation"),
    ).toBeInTheDocument();
  });

  it("names an account whose profile could not be read rather than hiding it", () => {
    // The directory is built from the role stores. A row it cannot describe is still a row
    // somebody has access through.
    render(
      <AdminAccess
        access={authorized({
          members: [
            member({ display_name: "", email: "", profile_readable: false, role: "auditor" }),
          ],
        })}
        now={NOW}
      />,
    );

    const table = screen.getByRole("region", { name: "Staff accounts" });
    expect(within(table).getByText("Account not readable")).toBeInTheDocument();
    expect(within(table).getByText("Auditor")).toBeInTheDocument();
  });

  it("says when an account holds its role by deployment configuration", () => {
    render(
      <AdminAccess
        access={authorized({
          members: [member({ user_id: OWNER_ID, role: "owner", break_glass: true })],
        })}
        now={NOW}
      />,
    );

    expect(screen.getByText(/Pinned by deployment configuration/i)).toBeInTheDocument();
  });

  it("counts the elevated accounts, which is the number somebody audits", () => {
    render(
      <AdminAccess
        access={authorized({
          members: [
            member({ user_id: OWNER_ID, role: "owner" }),
            member({ user_id: ADMIN_ID, role: "admin" }),
            member({ role: "support", is_active: false }),
          ],
        })}
        now={NOW}
      />,
    );

    const totals = screen.getByRole("list", { name: "Staff summary" });
    const stat = (label: string) =>
      within(totals)
        .getAllByRole("listitem")
        .find((item) => item.textContent?.startsWith(label));
    expect(stat("Staff accounts")).toHaveTextContent("Staff accounts3");
    expect(stat("Owner or Admin")).toHaveTextContent("Owner or Admin2");
    expect(stat("Deactivated")).toHaveTextContent("Deactivated1");
  });

  it("offers the grant form only to somebody who may use it", () => {
    render(<AdminAccess access={authorized({ can_grant: false })} now={NOW} />);

    expect(screen.queryByRole("textbox", { name: "Account id" })).not.toBeInTheDocument();
    expect(screen.getByText(/can see who is staff but cannot change it/i)).toBeInTheDocument();
  });

  it("does not offer Owner or Admin in the picker", () => {
    // They are set from Roles, which only an Owner holds. A picker that offered them would
    // be a control the API refuses.
    render(<AdminAccess access={authorized()} now={NOW} />);

    const picker = screen.getByRole("combobox", { name: "Role" });
    const options = within(picker)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).not.toContain("Owner");
    expect(options).not.toContain("Admin");
    expect(options).toContain("Support manager");
    expect(options).toContain("Remove staff access");
  });

  it("marks the roles it cannot set", () => {
    render(<AdminAccess access={authorized()} now={NOW} />);

    const catalogue = screen
      .getByRole("heading", { name: "What each role permits" })
      .closest("article");
    expect(catalogue).not.toBeNull();
    expect(within(catalogue!).getByText("Set from Roles")).toBeInTheDocument();
  });

  it("says the legacy store could not be read rather than presenting a partial list as whole", () => {
    render(<AdminAccess access={authorized({ legacy_readable: false })} now={NOW} />);

    expect(screen.getByText(/missing from it/i)).toBeInTheDocument();
  });

  it.each([
    ["forbidden", /cannot read the staff directory/i],
    ["unreachable", /could not be reached/i],
    ["unreadable", /could not read/i],
  ] as const)("says why the directory is missing when it is %s", (reason, expected) => {
    render(
      <AdminAccess
        access={{ status: "unavailable", me, assurance, reason, correlationId: null }}
        now={NOW}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(expected);
    expect(screen.queryByRole("region", { name: "Staff accounts" })).not.toBeInTheDocument();
  });

  it("prints the correlation id so the failing read can be found in the service logs", () => {
    render(
      <AdminAccess
        access={{
          status: "unavailable",
          me,
          assurance,
          reason: "unreachable",
          correlationId: "qt-abc123",
        }}
        now={NOW}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("qt-abc123");
  });

  it("does not invent a reference when the service gave no correlation id", () => {
    render(
      <AdminAccess
        access={{ status: "unavailable", me, assurance, reason: "forbidden", correlationId: null }}
        now={NOW}
      />,
    );

    expect(screen.getByRole("alert")).not.toHaveTextContent(/reference/i);
  });

  it("shows a tenancy with no staff as empty, not as an error", () => {
    render(<AdminAccess access={authorized({ members: [] })} now={NOW} />);

    expect(screen.getByText("No staff accounts")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("refuses an account that cannot enter the console", () => {
    render(<AdminAccess access={{ status: "forbidden", me }} now={NOW} />);

    expect(screen.queryByRole("region", { name: "Staff accounts" })).not.toBeInTheDocument();
  });
});
