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

  it("points an unverified session at security settings", () => {
    render(
      <AdminGate access={{ status: "mfa-required" }} section="Audit">
        <p>Privileged content</p>
      </AdminGate>,
    );
    expect(screen.getByRole("heading", { name: /verified second factor/i })).toBeVisible();
    expect(screen.getByRole("link", { name: /security settings/i })).toHaveAttribute(
      "href",
      "/account/security",
    );
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
