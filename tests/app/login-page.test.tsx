import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  verifyLoginChallenge: vi.fn(),
}));

vi.mock("@/app/login/actions", () => ({
  login: mocks.login,
  verifyLoginChallenge: mocks.verifyLoginChallenge,
}));

import LoginPage from "@/app/login/page";

const STATE = "c2VjcmV0LXN0YXRlLWZyb20tdGhlLWFwcA";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const PATH = `/connect/desktop?state=${STATE}&port=53321&challenge=${CHALLENGE}`;

describe("LoginPage", () => {
  it("tells a visitor the desktop app sent that they will be returned to it", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ next: PATH }) }));

    expect(screen.getByText(/returned to the app automatically/iu)).toBeVisible();
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      `/signup?next=${encodeURIComponent(PATH)}`,
    );
    expect(document.querySelector('input[name="next"]')).toHaveValue(PATH);
  });

  it("keeps the plain sign-in surface for everyone else", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ next: "/account/security" }) }));

    expect(screen.queryByText(/returned to the app automatically/iu)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/signup",
    );
    expect(document.querySelector('input[name="next"]')).toHaveValue("/account/security");
  });
});
