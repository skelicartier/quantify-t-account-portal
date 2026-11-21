import type { ReactNode } from "react";

import { logout, setConsoleTheme } from "@/app/account/actions";
import { AdminPasskeyNotice } from "@/components/admin/admin-passkey-notice";
import { ConsoleShell } from "@/components/shell/console-shell";
import type { ShellIdentity } from "@/components/shell/shell-types";
import { getAdminEntry } from "@/lib/admin/access";
import { getCurrentAccount } from "@/lib/dal/account";
import { getCurrentAssurance } from "@/lib/dal/assurance-guard";
import { DEV_PERSONAS, devAutologinPersona } from "@/lib/auth/dev-bypass";
import { readConsoleTheme } from "@/lib/dal/theme";

function initialsFor(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/u).filter(Boolean);
  const letters = parts.length >= 2 ? `${parts[0]![0]}${parts[1]![0]}` : local.slice(0, 2);
  return (letters || "QT").toUpperCase();
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // The pages keep the hard gates; the layout only needs enough to draw the frame. The
  // account is read too, so the rail names the person the way the account pages do; a
  // failed read falls back to the address.
  const [entry, theme, account, assurance] = await Promise.all([
    getAdminEntry(),
    readConsoleTheme(),
    getCurrentAccount().catch(() => null),
    // The same read every page below makes, once per request; it never throws.
    getCurrentAssurance(),
  ]);
  const passkeyNotice = entry?.canEnterAdmin ? (
    <AdminPasskeyNotice passkey={assurance.passkey} />
  ) : null;
  const identity: ShellIdentity = entry
    ? {
        email: entry.me.user.email,
        displayName:
          account?.displayName || (entry.me.user.email.split("@")[0] ?? entry.me.user.email),
        initials: account?.initials || initialsFor(entry.me.user.email),
        plan: account?.profileState === "ready" ? account.subscriptionTier : null,
        role: entry.me.role.effective,
        environment: entry.me.environment,
        canEnterAdmin: entry.canEnterAdmin,
        devPersonas: devAutologinPersona() ? DEV_PERSONAS : undefined,
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
      signOutAction={logout}
      theme={theme}
      themeAction={setConsoleTheme}
      notice={passkeyNotice ?? undefined}
    >
      {children}
    </ConsoleShell>
  );
}
