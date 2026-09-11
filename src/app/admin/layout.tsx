import type { ReactNode } from "react";

import { logout, setConsoleTheme } from "@/app/account/actions";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { ConsoleShell } from "@/components/shell/console-shell";
import type { ShellIdentity } from "@/components/shell/shell-types";
import { getAdminEntry } from "@/lib/admin/access";
import { readConsoleTheme } from "@/lib/dal/theme";

function initialsFor(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/u).filter(Boolean);
  const letters = parts.length >= 2 ? `${parts[0]![0]}${parts[1]![0]}` : local.slice(0, 2);
  return (letters || "QT").toUpperCase();
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // The pages keep the hard gates; the layout only needs enough to draw the frame.
  const [entry, theme] = await Promise.all([getAdminEntry(), readConsoleTheme()]);
  const identity: ShellIdentity = entry
    ? {
        email: entry.me.user.email,
        displayName: entry.me.user.email.split("@")[0] ?? entry.me.user.email,
        initials: initialsFor(entry.me.user.email),
        role: entry.me.role.effective,
        environment: entry.me.environment,
        canEnterAdmin: entry.canEnterAdmin,
      }
    : {
        email: null,
        displayName: "Administrator",
        initials: "QT",
        role: null,
        environment: null,
        canEnterAdmin: false,
      };

  return (
    <ConsoleShell
      section="admin"
      identity={identity}
      nav={<AdminNavigation />}
      signOutAction={logout}
      theme={theme}
      themeAction={setConsoleTheme}
    >
      {children}
    </ConsoleShell>
  );
}
