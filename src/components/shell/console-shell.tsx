import type { ReactNode } from "react";

import { Footer } from "@/components/shell/footer";
import type { ShellIdentity, ShellSection } from "@/components/shell/shell-types";
import { Sidebar } from "@/components/shell/sidebar";
import { ThemeScope } from "@/components/shell/theme-scope";
import { Topbar } from "@/components/shell/topbar";
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
 * The console frame: a sticky sidebar with section navigation and identity, a mobile
 * top bar that opens the same sidebar as an overlay, the page column, and the footer.
 * Synchronous on purpose — layouts await their data and hand it in as props.
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
      <Topbar section={section} />
      <div className="shell__body">
        <Sidebar section={section} identity={identity} nav={nav} signOutAction={signOutAction} />
        <main className="shell__main" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      <Footer />
    </ThemeScope>
  );
}
