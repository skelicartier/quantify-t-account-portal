"use client";

import Link from "@/components/ui/link";
import { usePathname } from "next/navigation";

import type { NavLink } from "@/components/shell/nav-links";
import { usePendingPath } from "@/components/shell/pending-route";

type SidebarNavProps = {
  /** The landmark's name, for screen readers ("Account sections"). */
  label: string;
  /** The group's visible heading in the rail ("Account"). */
  heading: string;
  links: readonly NavLink[];
  collapsed?: boolean;
};

/** One group of the rail: a mono heading, then icon-and-word links; the current one tinted. */
export function SidebarNav({ label, heading, links, collapsed = false }: SidebarNavProps) {
  const committed = usePathname();
  // The section a pressed link is opening, tinted from the press rather than from the
  // moment its page starts to arrive.
  const pathname = usePendingPath() ?? committed;
  return (
    <nav className="rail__group" aria-label={label}>
      <p className="rail__group-label">{heading}</p>
      <ul>
        {links.map(({ href, label: text, icon: Icon, activePrefix }) => {
          const current =
            pathname === href || (activePrefix ? pathname.startsWith(activePrefix) : false);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                title={collapsed ? text : undefined}
              >
                <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                <span className="rail__link-label">{text}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
