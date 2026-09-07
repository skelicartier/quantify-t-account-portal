"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ADMIN_LINKS = [
  { href: "/admin", label: "Dashboard", activePrefix: undefined },
  { href: "/admin/users", label: "Users", activePrefix: "/admin/users/" },
  { href: "/admin/notifications", label: "Notifications", activePrefix: undefined },
  { href: "/admin/email", label: "Email", activePrefix: undefined },
  { href: "/admin/audit", label: "Audit", activePrefix: undefined },
  { href: "/admin/reports", label: "Reports", activePrefix: undefined },
  { href: "/admin/configuration", label: "Configuration", activePrefix: undefined },
  { href: "/admin/credentials", label: "Credentials", activePrefix: undefined },
  { href: "/admin/releases", label: "Releases", activePrefix: undefined },
  { href: "/admin/roles", label: "Roles", activePrefix: undefined },
] as const;

export function AdminNavigation() {
  const pathname = usePathname();
  return (
    <nav className="account-navigation admin-navigation" aria-label="Administration sections">
      {ADMIN_LINKS.map(({ href, label, activePrefix }) => {
        const current =
          pathname === href || (activePrefix ? pathname.startsWith(activePrefix) : false);
        return (
          <Link key={href} href={href} aria-current={current ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
