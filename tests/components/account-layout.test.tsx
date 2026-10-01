import { render, screen } from "@testing-library/react";

import AccountLayout from "@/app/account/layout";

const accountMocks = vi.hoisted(() => ({
  logout: vi.fn(async () => undefined),
  setConsoleTheme: vi.fn(async () => undefined),
  requireCurrentAccount: vi.fn(),
  getAdminEntry: vi.fn(),
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
  getAdminEntry: accountMocks.getAdminEntry,
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
    accountMocks.getAdminEntry.mockResolvedValue(null);
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

  it("offers administration only when the backend admits the caller", async () => {
    accountMocks.getAdminEntry.mockResolvedValue({
      canEnterAdmin: true,
      me: {
        role: { effective: "owner" },
        user: { email: "user@example.com" },
        environment: "production",
      },
    });

    render(await AccountLayout({ children: <p>Protected</p> }));

    const admin = screen.getByRole("navigation", { name: "Administration sections" });
    expect(admin).toBeVisible();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/admin");
    expect(screen.getByText("Owner · Desk plan")).toBeVisible();
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
