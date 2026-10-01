import type { ReactNode } from "react";

import { ContextBar } from "@/components/shell/context-bar";
import { Rail } from "@/components/shell/rail";
import type { ShellIdentity, ShellSection } from "@/components/shell/shell-types";
import { ThemeScope } from "@/components/shell/theme-scope";
import { DEFAULT_CONSOLE_THEME } from "@/lib/theme";
import type { ConsoleTheme } from "@/lib/theme";

type ConsoleShellProps = {
  section: ShellSection;
  identity: ShellIdentity;
  signOutAction: () => Promise<void>;
  theme?: ConsoleTheme | undefined;
  themeAction?: ((formData: FormData) => Promise<void>) | undefined;
  children: ReactNode;
};

/**
 * The frame: an inverted L of rail and context bar around the work surface — no footer,
 * no hero. Synchronous on purpose: the layouts await their data and hand it in as props.
 */
export function ConsoleShell({
  section,
  identity,
  signOutAction,
  theme = DEFAULT_CONSOLE_THEME,
  themeAction,
  children,
}: ConsoleShellProps) {
  return (
    <ThemeScope section={section} theme={theme} action={themeAction}>
      <Rail identity={identity} signOutAction={signOutAction} />
      <div className="shell__body">
        <ContextBar />
        <main className="shell__main" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </ThemeScope>
  );
}
