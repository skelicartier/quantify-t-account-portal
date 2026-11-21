import { render, screen } from "@testing-library/react";

import { AdminGate } from "@/components/admin/admin-gate";

describe("AdminGate", () => {
  it("renders children only when authorized", () => {
    render(
      <AdminGate access={{ status: "authorized" }} section="Audit">
        <p>Privileged content</p>
      </AdminGate>,
    );
    expect(screen.getByText("Privileged content")).toBeVisible();
  });

  it("explains a forbidden account with a way back", () => {
    render(
      <AdminGate access={{ status: "forbidden" }} section="Audit">
        <p>Privileged content</p>
      </AdminGate>,
    );
    expect(screen.getByRole("heading", { name: /not authorized/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /return to account/i })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(screen.queryByText("Privileged content")).not.toBeInTheDocument();
  });

  const passkey = {
    mode: "when-enrolled" as const,
    staff: true,
    enrolled: true,
    count: 1,
    required: true,
    verified: false,
    fresh: false,
    verifiedUntil: null,
    freshUntil: null,
  };
  const owed = {
    verifiedTotpFactors: [],
    unverifiedTotpFactorIds: [],
    currentLevel: "aal1" as const,
    requiredLevel: "aal2" as const,
    mfaEnrolled: true,
    challengeRequired: true,
    levelReadable: true,
    factorsReadable: true,
  };

  it("asks a session that owes its passkey for the passkey, on the spot", () => {
    render(
      <AdminGate
        access={{ status: "mfa-required", assurance: { ...owed, passkey } }}
        section="Audit"
      >
        <p>Privileged content</p>
      </AdminGate>,
    );
    expect(screen.getByRole("heading", { name: /confirm it is you/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /use passkey/i })).toBeEnabled();
    expect(screen.queryByText("Privileged content")).not.toBeInTheDocument();
  });

  it("sends a staff account that must add its first passkey to security settings", () => {
    render(
      <AdminGate
        access={{
          status: "mfa-required",
          assurance: {
            ...owed,
            mfaEnrolled: false,
            challengeRequired: false,
            passkey: { ...passkey, mode: "required", enrolled: false, count: 0 },
          },
        }}
        section="Audit"
      >
        <p>Privileged content</p>
      </AdminGate>,
    );
    expect(screen.getByRole("heading", { name: /add a passkey to open administration/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /security settings/i })).toHaveAttribute(
      "href",
      "/account/security#security-passkeys-heading",
    );
    expect(screen.queryByRole("button", { name: /passkey/i })).not.toBeInTheDocument();
  });

  it("says the check failed, and offers no passkey prompt, when the state could not be read", () => {
    render(
      <AdminGate access={{ status: "mfa-required" }} section="Audit">
        <p>Privileged content</p>
      </AdminGate>,
    );
    expect(screen.getByRole("heading", { name: /could not be checked/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /try again/i })).toHaveAttribute("href", "/admin");
    expect(screen.queryByText("Privileged content")).not.toBeInTheDocument();
  });

  it("names the missing permission in product language", () => {
    render(
      <AdminGate
        access={{ status: "capability-required", capability: "audit:read" }}
        section="Audit"
      >
        <p>Privileged content</p>
      </AdminGate>,
    );
    expect(screen.getByRole("heading", { name: "Audit is not available" })).toBeVisible();
    expect(screen.getByText(/audit access/i)).toBeVisible();
    expect(screen.queryByText("audit:read")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /return to dashboard/i })).toHaveAttribute(
      "href",
      "/admin",
    );
  });

  it("handles a missing account record", () => {
    render(
      <AdminGate access={{ status: "not-found" }} section="User detail">
        <p>Privileged content</p>
      </AdminGate>,
    );
    expect(screen.getByRole("heading", { name: /no account record/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /return to users/i })).toHaveAttribute(
      "href",
      "/admin/users",
    );
  });
});
