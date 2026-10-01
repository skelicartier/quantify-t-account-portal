import type { ReactNode } from "react";

import { logout, setConsoleTheme } from "@/app/account/actions";
import { ConsoleShell } from "@/components/shell/console-shell";
import { getAccountRole } from "@/lib/admin/access";
import { DEV_PERSONAS, devAutologinPersona } from "@/lib/auth/dev-bypass";
import { requireCurrentAccount } from "@/lib/dal/account";
import { readConsoleTheme } from "@/lib/dal/theme";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const account = await requireCurrentAccount();
  // Fails closed to null: the account pages never depend on the role read succeeding.
  const [role, theme] = await Promise.all([getAccountRole(), readConsoleTheme()]);

  return (
    <ConsoleShell
      section="account"
      identity={{
        email: account.email,
        displayName: account.displayName,
        initials: account.initials,
        role,
        plan: account.subscriptionTier,
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
