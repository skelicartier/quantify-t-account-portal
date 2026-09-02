import { render, screen } from "@testing-library/react";

import AccountLayout from "@/app/account/layout";

const accountMocks = vi.hoisted(() => ({
  logout: vi.fn(async () => undefined),
  requireCurrentAccount: vi.fn(),
}));

vi.mock("@/app/account/actions", () => ({
  logout: accountMocks.logout,
}));

vi.mock("@/lib/dal/account", () => ({
  requireCurrentAccount: accountMocks.requireCurrentAccount,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/account",
}));

describe("AccountLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accountMocks.requireCurrentAccount.mockResolvedValue({ email: "user@example.com" });
  });

  it("guards the shell with the protected account lookup and renders sign out", async () => {
    const layout = await AccountLayout({ children: <main>Protected account content</main> });
    render(layout);

    expect(accountMocks.requireCurrentAccount).toHaveBeenCalledOnce();
    expect(screen.getByRole("navigation", { name: "Account sections" })).toBeVisible();
    expect(screen.getByText("user@example.com")).toBeVisible();
    expect(screen.getByText("Protected account content")).toBeVisible();
    const signOut = screen.getByRole("button", { name: "Sign out" });
    expect(signOut).toHaveAttribute("type", "submit");
    expect(signOut.closest("form")).not.toBeNull();
  });

  it("does not construct protected content when the account guard redirects", async () => {
    accountMocks.requireCurrentAccount.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/login"));

    await expect(AccountLayout({ children: <main>Must not render</main> })).rejects.toThrowError(
      "NEXT_REDIRECT:/login",
    );
    expect(accountMocks.requireCurrentAccount).toHaveBeenCalledOnce();
    expect(accountMocks.logout).not.toHaveBeenCalled();
  });
});
