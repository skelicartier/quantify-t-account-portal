import type { ReactNode } from "react";

import { AppBar } from "@/components/shell/app-bar";
import { Footer } from "@/components/shell/footer";
import type { ShellIdentity, ShellSection } from "@/components/shell/shell-types";
import { Sidebar } from "@/components/shell/sidebar";
import { ThemeScope } from "@/components/shell/theme-scope";
import { DEFAULT_CONSOLE_THEME } from "@/lib/theme";
import type { ConsoleTheme } from "@/lib/theme";

type ConsoleShellProps = {
  section: ShellSection;
  identity: ShellIdentity;
  nav: ReactNode;
  signOutAction: () => Promise<void>;
  theme?: ConsoleTheme | undefined;
  themeAction?: ((formData: FormData) => Promise<void>) | undefined;
  children: ReactNode;
};

/**
 * The console frame: a sidebar pinned to the left edge for navigation and identity, and
 * a content column with a slim app bar (theme switch, clock, phone navigation toggle),
 * the page, and the footer. Synchronous on purpose — layouts await their data and hand
 * it in as props.
 */
export function ConsoleShell({
  section,
  identity,
  nav,
  signOutAction,
  theme = DEFAULT_CONSOLE_THEME,
  themeAction,
  children,
}: ConsoleShellProps) {
  return (
    <ThemeScope section={section} theme={theme} action={themeAction}>
      <Sidebar section={section} identity={identity} nav={nav} signOutAction={signOutAction} />
      <div className="shell__body">
        <AppBar section={section} />
        <main className="shell__main" id="main-content" tabIndex={-1}>
          {children}
        </main>
        <Footer />
      </div>
    </ThemeScope>
  );
}
