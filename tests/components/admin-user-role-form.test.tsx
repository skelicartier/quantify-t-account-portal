import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdminUserDetail } from "@/components/admin/admin-user-detail";
import { AdminUserRoleForm } from "@/components/admin/admin-user-role-form";
import type { AccountApiAdminUserDetail, AccountApiMe } from "@/lib/admin/account-api";
import type { AdminUserDetailAccess } from "@/lib/admin/access";
import type { AdminUserRoleState } from "@/lib/admin/user-role";
import type { AssuranceState } from "@/lib/auth/assurance";

const OWNER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";
const TARGET_ID = "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66";

const me: AccountApiMe = {
  ok: true,
  correlation_id: "qt-me",
  user: { user_id: OWNER_ID, email: "owner@example.test", is_active: true },
  role: {
    effective: "owner",
    database: "owner",
    legacy: "admin",
    mismatch: "expected-owner-projection",
    break_glass: false,
  },
  capabilities: ["account:read-self", "account:read-any", "roles:write", "users:set-active"],
  environment: "production",
};

const assurance: AssuranceState = {
  verifiedTotpFactors: [],
  unverifiedTotpFactorIds: [],
  currentLevel: "aal1",
  requiredLevel: "aal1",
  mfaEnrolled: false,
  challengeRequired: false,
  levelReadable: true,
  factorsReadable: true,
};

const detail: AccountApiAdminUserDetail = {
  ok: true,
  correlation_id: "qt-detail",
  user: {
    user_id: TARGET_ID,
    email: "person@example.test",
    first_name: "Pat",
    last_name: "Person",
    display_name: "Pat Person",
    is_active: true,
    subscription_tier: "free",
    created_at: "2026-09-01T00:00:00Z",
    last_login_at: "2026-09-04T00:00:00Z",
    updated_at: "2026-09-04T00:00:00Z",
  },
  role: {
    effective: "user",
    database: "user",
    legacy: null,
    mismatch: "missing-in-legacy",
    break_glass: false,
  },
  sessions: [],
  activity: [],
};

const noop = async (): Promise<AdminUserRoleState> => ({ status: "idle", message: "" });

describe("AdminUserRoleForm", () => {
  it("submits the chosen role only after a change and a confirmation", async () => {
    const user = userEvent.setup();
    const submissions: FormData[] = [];
    const action = vi.fn(async (_state: AdminUserRoleState, data: FormData) => {
      submissions.push(data);
      return { status: "success" as const, message: "Role set to Admin." };
    });

    render(<AdminUserRoleForm userId={TARGET_ID} currentRole="user" action={action} />);

    const select = screen.getByRole("combobox", { name: "Role" });
    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Change role" })).toBeDisabled();

    await user.selectOptions(select, "admin");
    expect(screen.getByRole("button", { name: "Change role" })).toBeEnabled();
    expect(screen.getByText(/elevated roles can see/i)).toBeVisible();

    await user.click(screen.getByRole("checkbox", { name: /i understand this changes/i }));
    await user.click(screen.getByRole("button", { name: "Change role" }));

    expect(action).toHaveBeenCalled();
    expect(submissions[0]?.get("userId")).toBe(TARGET_ID);
    expect(submissions[0]?.get("role")).toBe("admin");
    expect(submissions[0]?.get("confirm")).toBe("on");
    expect(await screen.findByRole("status")).toHaveTextContent("Role set to Admin.");
  });
});

describe("AdminUserDetail role management", () => {
  it("offers the role form to an owner viewing someone else", () => {
    render(
      <AdminUserDetail
        access={
          {
            status: "authorized",
            me,
            assurance,
            detail,
            usage: null,
          } satisfies AdminUserDetailAccess
        }
        roleAction={noop}
        now={Date.parse("2026-09-05T00:00:00Z")}
      />,
    );
    expect(screen.getByRole("heading", { name: "Pat Person" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Role" })).toBeVisible();
    expect(screen.getByText("Missing from legacy registry")).toBeVisible();
    expect(screen.queryByText(/pin|passcode/i)).not.toBeInTheDocument();
  });

  it("never offers the role form for the caller's own account or without the permission", () => {
    const { rerender } = render(
      <AdminUserDetail
        access={
          {
            status: "authorized",
            me,
            assurance,
            detail: { ...detail, user: { ...detail.user, user_id: OWNER_ID } },
            usage: null,
          } satisfies AdminUserDetailAccess
        }
        roleAction={noop}
      />,
    );
    expect(screen.queryByRole("combobox", { name: "Role" })).not.toBeInTheDocument();
    expect(screen.getByText(/can't change your own role/i)).toBeVisible();

    rerender(
      <AdminUserDetail
        access={
          {
            status: "authorized",
            me: {
              ...me,
              role: { ...me.role, effective: "admin" },
              capabilities: ["account:read-any"],
            },
            assurance,
            detail,
            usage: null,
          } satisfies AdminUserDetailAccess
        }
        roleAction={noop}
      />,
    );
    expect(screen.queryByRole("combobox", { name: "Role" })).not.toBeInTheDocument();
    expect(screen.getByText(/manage roles permission/i)).toBeVisible();
  });
});
