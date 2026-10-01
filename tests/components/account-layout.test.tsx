import { render, screen } from "@testing-library/react";

import AccountLayout from "@/app/account/layout";

const accountMocks = vi.hoisted(() => ({
  logout: vi.fn(async () => undefined),
  setConsoleTheme: vi.fn(async () => undefined),
  requireCurrentAccount: vi.fn(),
  getAccountRole: vi.fn(),
  readConsoleTheme: vi.fn(async () => "dark" as const),
}));

vi.mock("@/app/account/actions", () => ({
  logout: accountMocks.logout,
  setConsoleTheme: accountMocks.setConsoleTheme,
}));

vi.mock("@/lib/dal/theme", () => ({
  readConsoleTheme: accountMocks.readConsoleTheme,
}));

vi.mock("@/lib/dal/account", () => ({
  requireCurrentAccount: accountMocks.requireCurrentAccount,
}));

vi.mock("@/lib/admin/access", () => ({
  getAccountRole: accountMocks.getAccountRole,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const account = {
  userId: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
  email: "user@example.com",
  displayName: "Avery Stone",
  initials: "AS",
  status: "active",
  subscriptionTier: "professional",
  memberSince: null,
  lastSignInAt: null,
  emailConfirmed: true,
  profileState: "ready",
};

describe("AccountLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accountMocks.requireCurrentAccount.mockResolvedValue(account);
    accountMocks.getAccountRole.mockResolvedValue(null);
  });

  it("guards the shell with the protected account lookup and renders sign out", async () => {
    const layout = await AccountLayout({ children: <p>Protected account content</p> });
    render(layout);

    expect(accountMocks.requireCurrentAccount).toHaveBeenCalledOnce();
    expect(screen.getByRole("navigation", { name: "Account sections" })).toBeVisible();
    // The address sits in the identity menu, behind the name.
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByText("Avery Stone")).toBeVisible();
    expect(screen.getByText("Protected account content")).toBeVisible();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    const signOut = screen.getByRole("menuitem", { name: "Sign out" });
    expect(signOut).toHaveAttribute("type", "submit");
    expect(signOut.closest("form")).not.toBeNull();
    expect(screen.getAllByRole("menuitem", { name: "Sign out" })).toHaveLength(1);
    expect(
      screen.queryByRole("navigation", { name: "Administration sections" }),
    ).not.toBeInTheDocument();
  });

  it("names a staff member's role but offers no administration: that is run from HQ", async () => {
    accountMocks.getAccountRole.mockResolvedValue("owner");

    render(await AccountLayout({ children: <p>Protected</p> }));

    expect(screen.getByText("Owner · Desk plan")).toBeVisible();
    expect(
      screen.queryByRole("navigation", { name: "Administration sections" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
  });

  it("does not construct protected content when the account guard redirects", async () => {
    accountMocks.requireCurrentAccount.mockRejectedValueOnce(new Error("NEXT_REDIRECT:/login"));

    await expect(AccountLayout({ children: <p>Must not render</p> })).rejects.toThrowError(
      "NEXT_REDIRECT:/login",
    );
    expect(accountMocks.requireCurrentAccount).toHaveBeenCalledOnce();
    expect(accountMocks.logout).not.toHaveBeenCalled();
  });
});
