import type { ReactNode } from "react";

import { logout, setConsoleTheme } from "@/app/account/actions";
import { ConsoleShell } from "@/components/shell/console-shell";
import { getAdminEntry } from "@/lib/admin/access";
import { DEV_PERSONAS, devAutologinPersona } from "@/lib/auth/dev-bypass";
import { requireCurrentAccount } from "@/lib/dal/account";
import { readConsoleTheme } from "@/lib/dal/theme";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const account = await requireCurrentAccount();
  // Fails closed to null: the account pages never depend on the admin check succeeding.
  const [entry, theme] = await Promise.all([getAdminEntry(), readConsoleTheme()]);

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
    >
      {children}
    </ConsoleShell>
  );
}
