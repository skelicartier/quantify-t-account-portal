import { render, screen } from "@testing-library/react";

import { AdminUserDetail } from "@/components/admin/admin-user-detail";
import type { AccountApiMe, AccountApiAdminUserDetail } from "@/lib/admin/account-api";
import type { AdminUserDetailAccess } from "@/lib/admin/access";
import type { AdminUserSessionRevocationState } from "@/lib/admin/user-session-revocation";
import type { AssuranceState } from "@/lib/auth/assurance";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";
const TARGET_ID = "960aac31-73fb-4e10-8f3f-bfcf22a71c12";
const SESSION_ID = "7e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66";

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

const detail: AccountApiAdminUserDetail = {
  ok: true,
  correlation_id: "qt-detail",
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
  sessions: [
    {
      id: SESSION_ID,
      user_id: USER_ID,
      source: "desktop",
      provider: "supabase",
      client_instance_id: "client-123456",
      device_name: "MacBook",
      created_at: "2026-09-01T00:00:00Z",
      last_seen_at: "2026-09-04T00:00:00Z",
      expires_at: "2099-09-05T00:00:00Z",
      revoked_at: null,
      revoke_reason: null,
    },
  ],
  activity: [
    {
      id: "8e5f9c11-2a3b-4c5d-8e9f-0a1b2c3d4e66",
      user_id: USER_ID,
      session_id: SESSION_ID,
      event_type: "session.heartbeat",
      outcome: "success",
      source: "account-api",
      occurred_at: "2026-09-04T00:00:00Z",
      created_at: "2026-09-04T00:00:00Z",
    },
  ],
};

describe("AdminUserDetail", () => {
  it("renders minimized account, session, and activity detail", () => {
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
      />,
    );

    expect(screen.getByRole("heading", { name: "Owner One" })).toBeVisible();
    expect(screen.getByText("MacBook")).toBeVisible();
    expect(screen.getByText("Session Heartbeat")).toBeVisible();
    expect(
      screen.queryByText(/provider session|revoked by|pin|passcode|metadata/i),
    ).not.toBeInTheDocument();
  });

  it("renders a not-found state without user records", () => {
    render(
      <AdminUserDetail
        access={
          {
            status: "not-found",
            me,
            assurance,
          } satisfies AdminUserDetailAccess
        }
      />,
    );

    expect(screen.getByRole("heading", { name: /no account record/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /return to users/i })).toHaveAttribute(
      "href",
      "/admin/users",
    );
    expect(screen.queryByText("MacBook")).not.toBeInTheDocument();
  });

  it("renders session revoke controls only for granted cross-user sessions", () => {
    const action = vi.fn(async (state: AdminUserSessionRevocationState) => state);
    render(
      <AdminUserDetail
        sessionRevokeAction={action}
        access={
          {
            status: "authorized",
            me: { ...me, capabilities: [...me.capabilities, "sessions:revoke-any"] },
            assurance,
            detail: {
              ...detail,
              user: { ...detail.user, user_id: TARGET_ID, email: "user@example.test" },
              sessions: detail.sessions.map((session) => ({
                ...session,
                user_id: TARGET_ID,
              })),
            },
            usage: null,
          } satisfies AdminUserDetailAccess
        }
      />,
    );

    expect(screen.getByRole("button", { name: "Revoke" })).toBeVisible();
  });
});
