import { render, screen, within } from "@testing-library/react";

import { AdminAuditEvents } from "@/components/admin/admin-audit-events";
import type { AccountApiAdminAuditEvents, AccountApiMe } from "@/lib/admin/account-api";
import type { AdminAuditEventsAccess } from "@/lib/admin/access";
import type { AssuranceState } from "@/lib/auth/assurance";

const USER_ID = "860aac31-73fb-4e10-8f3f-bfcf22a71c11";

const me: AccountApiMe = {
  ok: true,
  correlation_id: "qt-correlation",
  user: { user_id: USER_ID, email: "owner@example.test", is_active: true },
  role: {
    effective: "support",
    database: "support",
    legacy: "support",
    mismatch: "match",
    break_glass: false,
  },
  capabilities: ["account:read-self", "account:read-any", "audit:read"],
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

const auditEvents: AccountApiAdminAuditEvents = {
  ok: true,
  correlation_id: "qt-audit",
  generated_at: "2026-09-04T08:54:54Z",
  pagination: { limit: 25, offset: 0, has_more: true, next_offset: 25 },
  filters: { event_type: "session.revoked" },
  events: [
    {
      id: "event-1",
      subject_user_id: USER_ID,
      actor_user_id: null,
      session_id: null,
      event_type: "session.revoked",
      outcome: "success",
      source: "account-api",
      request_id: null,
      occurred_at: "2026-09-04T01:00:00Z",
      created_at: "2026-09-04T01:00:00Z",
      summary: { actor_role: "redacted" },
    },
  ],
};

describe("AdminAuditEvents", () => {
  it("renders filtered audit events with pagination", () => {
    render(
      <AdminAuditEvents
        access={
          {
            status: "authorized",
            me,
            assurance,
            auditEvents,
            filters: { event_type: "session.revoked" },
            limit: 25,
            offset: 0,
          } satisfies AdminAuditEventsAccess
        }
      />,
    );

    expect(screen.getByRole("heading", { name: "Audit" })).toBeVisible();
    expect(screen.getByDisplayValue("session.revoked")).toBeVisible();
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/admin/audit?offset=25&limit=25&event_type=session.revoked",
    );
    const table = screen.getByRole("table");
    expect(within(table).getByText("Session Revoked")).toBeVisible();
    expect(within(table).getByText("Redacted")).toBeVisible();
    expect(
      screen.queryByText(/metadata|provider session|password|passcode/i),
    ).not.toBeInTheDocument();
  });

  it("renders a capability-required state before event rows", () => {
    render(
      <AdminAuditEvents
        access={
          {
            status: "capability-required",
            me: { ...me, capabilities: ["account:read-self", "account:read-any"] },
            assurance,
            capability: "audit:read",
          } satisfies AdminAuditEventsAccess
        }
      />,
    );

    expect(screen.getByRole("heading", { name: /audit is not available/i })).toBeVisible();
    expect(screen.queryByText("Session Revoked")).not.toBeInTheDocument();
  });

  it("names the subject and actor by email when the service resolved them", () => {
    render(
      <AdminAuditEvents
        access={
          {
            status: "authorized",
            me,
            assurance,
            auditEvents: {
              ...auditEvents,
              events: [
                {
                  ...auditEvents.events[0]!,
                  subject_email: "user@example.test",
                  actor_user_id: "4c7715ea-9ae3-4abd-b2f7-2d2c9a037d9b",
                  actor_email: "owner@example.test",
                },
              ],
            },
            filters: {},
            limit: 25,
            offset: 0,
          } satisfies AdminAuditEventsAccess
        }
      />,
    );

    expect(screen.getByRole("link", { name: "user@example.test" })).toHaveAttribute(
      "href",
      `/admin/users/${USER_ID}`,
    );
    expect(screen.getByRole("link", { name: "owner@example.test" })).toHaveAttribute(
      "href",
      "/admin/users/4c7715ea-9ae3-4abd-b2f7-2d2c9a037d9b",
    );
    expect(screen.getByText(USER_ID)).toBeInTheDocument();
  });
});
