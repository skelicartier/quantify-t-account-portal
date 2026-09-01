import { render, screen } from "@testing-library/react";

import { AuthShell } from "@/components/auth/auth-shell";

describe("AuthShell", () => {
  it("presents the Quantify Terminal identity and a single named account surface", () => {
    render(
      <AuthShell eyebrow="Secure access" title="Sign in" description="Use your cloud identity.">
        <button type="button">Continue</button>
      </AuthShell>,
    );

    expect(screen.getByRole("link", { name: /quantify terminal account home/i })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(screen.queryByText(/soc 2/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/all systems operational/i)).not.toBeInTheDocument();
  });
});
