"use client";

import { LogOut, Moon, ShieldCheck, Sun, UserRound } from "lucide-react";
import Link from "@/components/ui/link";

import type { ShellIdentity } from "@/components/shell/shell-types";
import { useConsoleTheme } from "@/components/shell/theme-scope";
import { planLabel } from "@/lib/admin/plan-catalogue";
import { roleLabel } from "@/lib/admin/role-labels";

type RailIdentityProps = {
  identity: ShellIdentity;
  signOutAction: () => Promise<void>;
  collapsed: boolean;
};

/** "Desk plan", "Owner · Desk plan", or "Owner · staging" — the line under the name. */
function identityLine(identity: ShellIdentity): string {
  const parts: string[] = [];
  if (identity.role && identity.role !== "user") parts.push(roleLabel(identity.role));
  if (identity.plan) parts.push(`${planLabel(identity.plan)} plan`);
  if (identity.environment && identity.environment !== "production")
    parts.push(identity.environment);
  return parts.join(" · ") || "Verified account";
}

/**
 * Who is signed in, as a menu: theme, Security, sign out. A native `<details>`, so it
 * works before hydration and closes on Escape like any disclosure.
 */
export function RailIdentity({ identity, signOutAction, collapsed }: RailIdentityProps) {
  const { theme, setTheme } = useConsoleTheme();
  return (
    <details className="rail__identity">
      <summary title={collapsed ? identity.displayName : undefined}>
        <span className="avatar avatar--small" aria-hidden="true">
          {identity.initials}
        </span>
        <span className="rail__identity-text">
          <span className="rail__identity-name">{identity.displayName}</span>
          <span className="rail__identity-role">{identityLine(identity)}</span>
        </span>
      </summary>
      <div className="rail__menu" role="menu">
        {identity.email && <p className="rail__menu-email">{identity.email}</p>}
        <button
          type="button"
          role="menuitem"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? (
            <Sun size={14} strokeWidth={1.8} aria-hidden="true" />
          ) : (
            <Moon size={14} strokeWidth={1.8} aria-hidden="true" />
          )}
          {theme === "dark" ? "Light theme" : "Dark theme"}
        </button>
        <Link href="/account/security" role="menuitem">
          <ShieldCheck size={14} strokeWidth={1.8} aria-hidden="true" />
          Security
        </Link>
        <form action={signOutAction}>
          <button type="submit" role="menuitem">
            <LogOut size={14} strokeWidth={1.8} aria-hidden="true" />
            Sign out
          </button>
        </form>
        {identity.devPersonas && identity.devPersonas.length > 0 && (
          <>
            <p className="rail__menu-label">Test as</p>
            {identity.devPersonas.map((persona) => (
              <a
                key={persona.email}
                role="menuitem"
                href={`/dev/signin?as=${encodeURIComponent(persona.email)}&next=%2Faccount`}
                aria-current={persona.email === identity.email ? "true" : undefined}
              >
                <UserRound size={14} strokeWidth={1.8} aria-hidden="true" />
                {persona.label}
              </a>
            ))}
          </>
        )}
      </div>
    </details>
  );
}
