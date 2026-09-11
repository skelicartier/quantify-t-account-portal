import { render, screen } from "@testing-library/react";

import { AuthShell } from "@/components/auth/auth-shell";

describe("AuthShell", () => {
  it("presents the Quantify Terminal identity and a single named account surface", () => {
    render(
      <AuthShell title="Sign in" description="Use your cloud identity.">
        <button type="button">Continue</button>
      </AuthShell>,
    );

    const wordmark = screen.getByRole("link", { name: /quantify terminal account home/i });
    expect(wordmark).toBeVisible();
    expect(wordmark).toHaveAttribute("href", "/login");
    expect(wordmark).toHaveTextContent(/quantify\s*terminal/i);
    // The brand is typographic on the credential surface: no image mark.
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(screen.queryByText(/soc 2/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/all systems operational/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "https://www.quantifyterminal.com/privacy",
    );
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  });
});
