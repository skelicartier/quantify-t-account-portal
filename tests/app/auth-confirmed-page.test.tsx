import { render, screen } from "@testing-library/react";

import ConfirmedPage from "@/app/auth/confirmed/page";

const HANDOFF_PATH = "/connect/desktop?handoff=c2VjcmV0LWhhbmRvZmYtaWQtZnJvbS10aGUtYXBw";

describe("ConfirmedPage", () => {
  it("says the email is verified and points at sign-in", async () => {
    render(await ConfirmedPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Your email is verified" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in to the console" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.queryByText(/waiting/iu)).not.toBeInTheDocument();
  });

  it("keeps a desktop handoff in the sign-in link and says the app is waiting", async () => {
    render(await ConfirmedPage({ searchParams: Promise.resolve({ next: HANDOFF_PATH }) }));

    expect(screen.getByText(/Quantify Terminal on your computer is waiting/u)).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in to the console" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent(HANDOFF_PATH)}`,
    );
  });

  it("ignores a next value that is not a desktop handoff", async () => {
    render(await ConfirmedPage({ searchParams: Promise.resolve({ next: "/admin" }) }));

    expect(screen.getByRole("link", { name: "Sign in to the console" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("explains an invalid or expired link and offers a way back in", async () => {
    render(
      await ConfirmedPage({
        searchParams: Promise.resolve({ reason: "invalid-confirm-link", next: HANDOFF_PATH }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "This link is invalid or has expired" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Reset your password" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    expect(screen.queryByText(/verified/u)).not.toBeInTheDocument();
  });
});
