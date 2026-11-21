"use client";

import Link from "@/components/ui/link";
import { usePathname } from "next/navigation";

import { BrandMark } from "@/components/brand/brand-mark";
import { MobileNavToggle } from "@/components/shell/mobile-nav-toggle";
import { ACCOUNT_LINKS, ADMIN_LINKS, type NavLink } from "@/components/shell/nav-links";
import { usePendingPath } from "@/components/shell/pending-route";
import { SidebarClock } from "@/components/shell/sidebar-clock";
import { ThemeToggle } from "@/components/shell/theme-toggle";

type Crumb = { href: string; label: string };

const GROUPS: ReadonlyArray<{ label: string; home: string; links: readonly NavLink[] }> = [
  { label: "Account", home: "/account", links: ACCOUNT_LINKS },
  { label: "Administration", home: "/admin", links: ADMIN_LINKS },
];

/** The section and page a path sits under, from the navigation table. */
function crumbsFor(pathname: string): Crumb[] {
  for (const group of GROUPS) {
    // The longest matching link wins: "/account/profile" over "/account".
    const link = [...group.links]
      .sort((a, b) => b.href.length - a.href.length)
      .find(
        (candidate) =>
          pathname === candidate.href ||
          (candidate.activePrefix ? pathname.startsWith(candidate.activePrefix) : false) ||
          (candidate.href !== group.home && pathname.startsWith(`${candidate.href}/`)),
      );
    if (!link) continue;
    const crumbs: Crumb[] = [{ href: group.home, label: group.label }];
    if (link.href !== group.home || pathname === group.home)
      crumbs.push({ href: link.href, label: link.label });
    return crumbs;
  }
  return [];
}

/**
 * The 44px bar over the work surface: where you are, and the few controls that apply
 * everywhere. On phones it carries the brand and the menu button instead.
 */
export function ContextBar() {
  const committed = usePathname();
  // Names the section a pressed link is opening, from the press, as the rail does.
  const pathname = usePendingPath() ?? committed;
  const crumbs = crumbsFor(pathname);
  return (
    <div className="cbar">
      <div className="cbar__lead">
        <MobileNavToggle />
        <BrandMark compact />
        {crumbs.length > 0 && (
          <nav className="cbar__crumbs" aria-label="Breadcrumb">
            {crumbs.map((crumb, index) => (
              <span key={`${crumb.href}-${index}`} className="cbar__crumb">
                {index > 0 && (
                  <span className="cbar__sep" aria-hidden="true">
                    ›
                  </span>
                )}
                {index === crumbs.length - 1 ? (
                  <span aria-current="page">{crumb.label}</span>
                ) : (
                  <Link href={crumb.href}>{crumb.label}</Link>
                )}
              </span>
            ))}
          </nav>
        )}
      </div>
      <div className="cbar__tools">
        <span className="cbar__status">
          <span className="cbar__dot" aria-hidden="true" />
          <SidebarClock />
        </span>
        <ThemeToggle />
      </div>
    </div>
  );
}
