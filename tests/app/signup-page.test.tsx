import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ signup: vi.fn() }));

vi.mock("@/app/signup/actions", () => ({ signup: mocks.signup }));

import SignupPage from "@/app/signup/page";

const PATH = "/connect/desktop?handoff=c2VjcmV0LWhhbmRvZmYtaWQtZnJvbS10aGUtYXBw";

describe("SignupPage", () => {
  it("carries a desktop handoff through sign-up and back to sign-in", async () => {
    render(await SignupPage({ searchParams: Promise.resolve({ next: PATH }) }));

    expect(screen.getByText(/returned to the desktop app on this computer/iu)).toBeVisible();
    expect(document.querySelector('form input[name="next"]')).toHaveValue(PATH);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent(PATH)}`,
    );
  });

  it("does not carry any other destination", async () => {
    render(await SignupPage({ searchParams: Promise.resolve({ next: "/admin" }) }));

    expect(
      screen.queryByText(/returned to the desktop app on this computer/iu),
    ).not.toBeInTheDocument();
    expect(document.querySelector('form input[name="next"]')).toBeNull();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });
});
