import { render, screen, within } from "@testing-library/react";

import { AdminNavigation } from "@/components/admin/admin-navigation";

const navigation = vi.hoisted(() => ({ pathname: "/admin" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const LINKS = [
  { href: "/admin", name: "Dashboard" },
  { href: "/admin/users", name: "Users" },
  { href: "/admin/subscriptions", name: "Subscriptions" },
  { href: "/admin/support", name: "Support" },
  { href: "/admin/notifications", name: "Notifications" },
  { href: "/admin/email", name: "Email" },
  { href: "/admin/audit", name: "Audit" },
  { href: "/admin/reports", name: "Reports" },
  { href: "/admin/configuration", name: "Configuration" },
  { href: "/admin/secrets", name: "Provider keys" },
  { href: "/admin/credentials", name: "Platform credentials" },
  { href: "/admin/releases", name: "Releases" },
  { href: "/admin/roles", name: "Roles" },
  { href: "/admin/access", name: "Access control" },
] as const;

describe("AdminNavigation", () => {
  it("renders a named navigation landmark with the implemented admin links", () => {
    render(<AdminNavigation />);

    const adminNavigation = screen.getByRole("navigation", { name: "Administration sections" });
    for (const { href, name } of LINKS) {
      expect(within(adminNavigation).getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(within(adminNavigation).getAllByRole("link")).toHaveLength(LINKS.length);
  });

  it.each(LINKS)("marks only the exact $name link as current", ({ href, name }) => {
    navigation.pathname = href;
    render(<AdminNavigation />);

    const adminNavigation = screen.getByRole("navigation", { name: "Administration sections" });
    expect(within(adminNavigation).getByRole("link", { name })).toHaveAttribute(
      "aria-current",
      "page",
    );
    for (const other of LINKS.filter((link) => link.href !== href)) {
      expect(within(adminNavigation).getByRole("link", { name: other.name })).not.toHaveAttribute(
        "aria-current",
      );
    }
  });

  it("does not mark a prefix-only route as current", () => {
    navigation.pathname = "/admin/roles/history";
    render(<AdminNavigation />);

    const adminNavigation = screen.getByRole("navigation", { name: "Administration sections" });
    for (const link of within(adminNavigation).getAllByRole("link")) {
      expect(link).not.toHaveAttribute("aria-current");
    }
  });

  it("marks the user directory for user detail routes", () => {
    navigation.pathname = "/admin/users/860aac31-73fb-4e10-8f3f-bfcf22a71c11";
    render(<AdminNavigation />);

    const adminNavigation = screen.getByRole("navigation", { name: "Administration sections" });
    expect(within(adminNavigation).getByRole("link", { name: "Users" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
