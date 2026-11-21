import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

  it("renders one frame: the account's sections, staff administration, and one sign-out", () => {
    render(
      <ConsoleShell section="account" identity={identity} signOutAction={signOut}>
        <p>Page body</p>
      </ConsoleShell>,
    );

    expect(screen.getByRole("navigation", { name: "Account sections" })).toBeVisible();
    // Staff get administration in the same rail; there is no separate console to switch to.
    expect(screen.getByRole("navigation", { name: "Administration sections" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/admin/users");
    // The rail's two groups and the context bar's breadcrumb; no footer.
    expect(screen.getAllByRole("navigation")).toHaveLength(3);
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByText("Page body")).toBeVisible();
    expect(screen.getByText("Avery Stone")).toBeVisible();
    // "professional" is a legacy tier that resolves to the Desk plan.
    expect(screen.getByText("Owner · Desk plan")).toBeVisible();
    // The address and sign-out live in the identity menu.
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem", { name: "Sign out" })).toHaveLength(1);
    // The wordmark heads the rail, and the phone bar where the rail is an overlay.
    for (const brand of screen.getAllByRole("link", { name: /quantify terminal, your account/i })) {
      expect(brand).toHaveAttribute("href", "/account");
    }
  });

  it("marks the current administration page and names a non-production environment", () => {
    navigation.pathname = "/admin/users/abc";
    render(
      <ConsoleShell
        section="admin"
        identity={{ ...identity, environment: "staging" }}
        signOutAction={signOut}
      >
        <p>Admin body</p>
      </ConsoleShell>,
    );

    expect(screen.getByRole("navigation", { name: "Administration sections" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Owner · Desk plan · staging")).toBeVisible();
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByRole("link", { name: "Administration" })).toHaveAttribute(
      "href",
      "/admin",
    );
  });

  it("flips the theme optimistically and persists the choice through the action", async () => {
    const user = userEvent.setup();
    const themeAction = vi.fn<(formData: FormData) => Promise<void>>(async () => undefined);
    const { container } = render(
      <ConsoleShell
        section="account"
        identity={identity}
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

  it("shows no administration to an account the backend does not admit", () => {
    render(
      <ConsoleShell
        section="account"
        identity={{ ...identity, canEnterAdmin: false, role: null }}
        signOutAction={signOut}
      >
        <p>Body</p>
      </ConsoleShell>,
    );

    expect(
      screen.queryByRole("navigation", { name: "Administration sections" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
    expect(screen.getByText("Desk plan")).toBeVisible();
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
