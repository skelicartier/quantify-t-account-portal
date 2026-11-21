import type { ReactNode } from "react";

import { logout, setConsoleTheme } from "@/app/account/actions";
import { AccessBanner } from "@/components/account/access-banner";
import { ConsoleShell } from "@/components/shell/console-shell";
import { getAdminEntry } from "@/lib/admin/access";
import { DEV_PERSONAS, devAutologinPersona } from "@/lib/auth/dev-bypass";
import { getCurrentAccessHold } from "@/lib/dal/access";
import { requireCurrentAccount } from "@/lib/dal/account";
import { readConsoleTheme } from "@/lib/dal/theme";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const account = await requireCurrentAccount();
  // Both fail closed to null: the account pages never depend on either. The admin entry
  // gives the role and whether the rail offers the administration section. The access hold
  // is said above every page, because a pending or declined account signs in here to read
  // its state and to export or delete its data.
  const [entry, theme, hold] = await Promise.all([
    getAdminEntry(),
    readConsoleTheme(),
    getCurrentAccessHold(),
  ]);

  return (
    <ConsoleShell
      section="account"
      identity={{
        email: account.email,
        displayName: account.displayName,
        initials: account.initials,
        role: entry?.me.role.effective ?? null,
        plan: account.subscriptionTier,
        canEnterAdmin: entry?.canEnterAdmin ?? false,
        devPersonas: devAutologinPersona() ? DEV_PERSONAS : undefined,
      }}
      signOutAction={logout}
      theme={theme}
      themeAction={setConsoleTheme}
      notice={hold ? <AccessBanner hold={hold} /> : undefined}
    >
      {children}
    </ConsoleShell>
  );
}
