import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AccountNavigation } from "@/components/account/account-navigation";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { ConsoleShell } from "@/components/shell/console-shell";
import { MobileNavToggle } from "@/components/shell/mobile-nav-toggle";

const navigation = vi.hoisted(() => ({ pathname: "/account" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const signOut = vi.fn(async () => undefined);

const identity = {
  email: "user@example.com",
  displayName: "Avery Stone",
  initials: "AS",
  role: "owner",
  plan: "professional",
  environment: "production",
  canEnterAdmin: true,
};

describe("ConsoleShell", () => {
  beforeEach(() => {
    navigation.pathname = "/account";
    document.documentElement.removeAttribute("data-nav-open");
  });

  it("renders the account frame with one navigation landmark and one sign-out", () => {
    render(
      <ConsoleShell
        section="account"
        identity={identity}
        nav={<AccountNavigation />}
        signOutAction={signOut}
      >
        <p>Page body</p>
      </ConsoleShell>,
    );

    expect(screen.getByRole("navigation", { name: "Account sections" })).toBeVisible();
    // Exactly two landmarks: the section navigation and the footer's legal links.
    expect(screen.getAllByRole("navigation")).toHaveLength(2);
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByText("Page body")).toBeVisible();
    expect(screen.getByText("Avery Stone")).toBeVisible();
    expect(screen.getByText("user@example.com")).toBeVisible();
    expect(screen.getByText("Professional plan")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: /admin console/i })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("contentinfo")).toHaveTextContent("QUANTIFY TERMINAL");
  });

  it("renders the admin frame with the role and environment badges", () => {
    navigation.pathname = "/admin/users/abc";
    render(
      <ConsoleShell
        section="admin"
        identity={identity}
        nav={<AdminNavigation />}
        signOutAction={signOut}
      >
        <p>Admin body</p>
      </ConsoleShell>,
    );

    expect(screen.getByRole("navigation", { name: "Administration sections" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Owner")).toBeVisible();
    expect(screen.getByText("Production")).toBeVisible();
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
    expect(screen.queryByRole("link", { name: /admin console/i })).not.toBeInTheDocument();
  });

  it("flips the theme optimistically and persists the choice through the action", async () => {
    const user = userEvent.setup();
    const themeAction = vi.fn<(formData: FormData) => Promise<void>>(async () => undefined);
    const { container } = render(
      <ConsoleShell
        section="account"
        identity={identity}
        nav={<AccountNavigation />}
        signOutAction={signOut}
        theme="dark"
        themeAction={themeAction}
      >
        <p>Body</p>
      </ConsoleShell>,
    );

    const shell = container.querySelector(".shell");
    expect(shell).toHaveAttribute("data-theme", "dark");
    const group = screen.getByRole("group", { name: "Console theme" });
    expect(within(group).getByRole("button", { name: "Dark" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(within(group).getByRole("button", { name: "Light" }));

    expect(themeAction).toHaveBeenCalledOnce();
    expect(themeAction.mock.calls[0]?.[0].get("theme")).toBe("light");
    // Optimistic state settles back to the server value once the action resolves; the
    // layout re-renders with the persisted theme in the real app.
    await waitFor(() => expect(shell).toHaveAttribute("data-theme", "dark"));
  });

  it("hides the admin switch when the backend does not admit the caller", () => {
    render(
      <ConsoleShell
        section="account"
        identity={{ ...identity, canEnterAdmin: false, role: null }}
        nav={<AccountNavigation />}
        signOutAction={signOut}
      >
        <p>Body</p>
      </ConsoleShell>,
    );

    expect(screen.queryByRole("link", { name: /admin console/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Owner")).not.toBeInTheDocument();
  });
});

describe("MobileNavToggle", () => {
  it("toggles the overlay attribute, updates aria-expanded, and closes on Escape", async () => {
    const user = userEvent.setup();
    render(
      <>
        <MobileNavToggle />
        <aside id="shell-sidebar">
          <a href="/account">Overview</a>
        </aside>
      </>,
    );

    const toggle = screen.getByRole("button", { name: "Open menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "shell-sidebar");

    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(document.documentElement.hasAttribute("data-nav-open")).toBe(true);

    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(document.documentElement.hasAttribute("data-nav-open")).toBe(false);
  });
});
