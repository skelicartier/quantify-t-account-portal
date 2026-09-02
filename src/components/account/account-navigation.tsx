"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ACCOUNT_LINKS = [
  { href: "/account", label: "Overview" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/preferences", label: "Preferences" },
] as const;

export function AccountNavigation() {
  const pathname = usePathname();
  return (
    <nav className="account-navigation" aria-label="Account sections">
      {ACCOUNT_LINKS.map(({ href, label }) => {
        const current = pathname === href;
        return (
          <Link key={href} href={href} aria-current={current ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
