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
    expect(screen.getByText("user@example.com")).toBeVisible();
    expect(screen.getByText("Avery Stone")).toBeVisible();
    expect(screen.getByText("Protected account content")).toBeVisible();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    const signOut = screen.getByRole("button", { name: "Sign out" });
    expect(signOut).toHaveAttribute("type", "submit");
    expect(signOut.closest("form")).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /admin console/i })).not.toBeInTheDocument();
  });

  it("offers the admin console only when the backend admits the caller", async () => {
    accountMocks.getAdminEntry.mockResolvedValue({
      canEnterAdmin: true,
      me: {
        role: { effective: "owner" },
        user: { email: "user@example.com" },
        environment: "production",
      },
    });

    render(await AccountLayout({ children: <p>Protected</p> }));

    expect(screen.getByRole("link", { name: /admin console/i })).toHaveAttribute("href", "/admin");
    expect(screen.getByText("Owner")).toBeVisible();
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
