import { render, screen, within } from "@testing-library/react";

import { AccountNavigation } from "@/components/account/account-navigation";

const navigation = vi.hoisted(() => ({ pathname: "/account" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const LINKS = [
  { href: "/account", name: "Overview" },
  { href: "/account/overnight", name: "Overnight" },
  { href: "/account/profile", name: "Profile" },
  { href: "/account/subscription", name: "Subscription" },
  { href: "/account/preferences", name: "Preferences" },
  { href: "/account/portfolios", name: "Portfolios" },
  { href: "/account/brokers", name: "Brokers" },
  { href: "/account/security", name: "Security" },
  { href: "/account/sessions", name: "Sessions" },
  { href: "/account/activity", name: "Activity" },
  { href: "/account/notifications", name: "Notifications" },
  { href: "/account/data", name: "Data" },
] as const;

describe("AccountNavigation", () => {
  it("renders a named navigation landmark with the exact account links", () => {
    render(<AccountNavigation />);

    const accountNavigation = screen.getByRole("navigation", { name: "Account sections" });
    for (const { href, name } of LINKS) {
      expect(within(accountNavigation).getByRole("link", { name })).toHaveAttribute("href", href);
    }
    // Exactly these links: a new section must be added deliberately, not silently.
    expect(within(accountNavigation).getAllByRole("link")).toHaveLength(LINKS.length);
  });

  it.each(LINKS)("marks only the exact $name link as current", ({ href, name }) => {
    navigation.pathname = href;
    render(<AccountNavigation />);

    const accountNavigation = screen.getByRole("navigation", { name: "Account sections" });
    expect(within(accountNavigation).getByRole("link", { name })).toHaveAttribute(
      "aria-current",
      "page",
    );
    for (const other of LINKS.filter((link) => link.href !== href)) {
      expect(within(accountNavigation).getByRole("link", { name: other.name })).not.toHaveAttribute(
        "aria-current",
      );
    }
  });

  it("does not mark a prefix-only route as current", () => {
    navigation.pathname = "/account/profile/security";
    render(<AccountNavigation />);

    const accountNavigation = screen.getByRole("navigation", { name: "Account sections" });
    for (const link of within(accountNavigation).getAllByRole("link")) {
      expect(link).not.toHaveAttribute("aria-current");
    }
  });
});
